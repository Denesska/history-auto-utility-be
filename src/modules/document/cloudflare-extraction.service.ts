import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParseResult } from './parsers/document-parser.interface';
import { DOCUMENT_EXTRACTION_PROMPT, DOCUMENT_JSON_CONTRACT_HINT, KNOWN_DOCUMENT_TYPES } from './document-extraction.prompt';
import { salvageJsonObject } from '../../common/ai/json-salvage.util';

const WORKERS_AI_BASE = 'https://api.cloudflare.com/client/v4/accounts';
const DEFAULT_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const MAX_OUTPUT_TOKENS = 2048;
const REQUEST_TIMEOUT_MS = 90_000;

// Workers AI vision models take images only — a scanned/text-based PDF still
// goes through RcaParser or Gemini (which reads PDFs natively); it just has no
// fallback here if Gemini is also down. In practice PDFs are the minority
// upload on this route (most users photograph the document with their phone).
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Thrown when Cloudflare itself is unreachable/overloaded, as opposed to a
 * document that simply isn't a recognisable type. Mirrors
 * GeminiServiceUnavailableError so the orchestrator (DocumentExtractionService)
 * can tell "both providers are down" apart from "neither could read this file".
 */
export class CloudflareExtractionUnavailableError extends Error {
    constructor() {
        super('Cloudflare extraction service is temporarily unavailable.');
        this.name = 'CloudflareExtractionUnavailableError';
    }
}

/**
 * Backup AI extractor for the same job as GeminiExtractionService, used only
 * when Gemini itself is down (HTTP 503 "UNAVAILABLE" — see
 * GeminiServiceUnavailableError). Same account/credentials as the identity
 * extraction feature's Cloudflare adapter (CLOUDFLARE_ACCOUNT_ID /
 * CLOUDFLARE_AI_TOKEN / CLOUDFLARE_VISION_MODEL) — it's the same Workers AI
 * vision model, just prompted for vehicle documents instead of ID cards.
 *
 * Workers AI has no schema-constrained response mode like Gemini's
 * `responseSchema`, so the model is instructed via DOCUMENT_JSON_CONTRACT_HINT
 * and the reply is salvaged defensively (it may arrive wrapped in prose or a
 * markdown fence, or be unusable altogether) — in which case this returns
 * `null` rather than throwing, same as "document not detected".
 *
 * Missing credentials disables the fallback rather than failing startup,
 * matching GeminiExtractionService.
 */
@Injectable()
export class CloudflareExtractionService {
    private readonly logger = new Logger(CloudflareExtractionService.name);
    private readonly accountId: string | undefined;
    private readonly token: string | undefined;
    private readonly model: string;
    private readonly gatewayUrl: string | undefined;

    constructor(private readonly config: ConfigService) {
        this.accountId = this.config.get<string>('CLOUDFLARE_ACCOUNT_ID')?.trim() || undefined;
        this.token = this.config.get<string>('CLOUDFLARE_AI_TOKEN')?.trim() || undefined;
        this.model = this.config.get<string>('CLOUDFLARE_VISION_MODEL')?.trim() || DEFAULT_MODEL;
        this.gatewayUrl = this.config.get<string>('CLOUDFLARE_AI_GATEWAY_URL')?.trim().replace(/\/+$/, '') || undefined;

        if (!this.isConfigured()) {
            this.logger.warn('CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_AI_TOKEN are not set — Cloudflare document extraction fallback is disabled.');
        }
    }

    isConfigured(): boolean {
        return Boolean(this.token && (this.accountId || this.gatewayUrl));
    }

    async extract(buffer: Buffer, mimeType: string): Promise<ParseResult | null> {
        if (!this.isConfigured()) return null;
        if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) return null;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(this.endpoint(), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                    'cf-aig-collect-log': 'false',
                    'cf-aig-collect-log-payload': 'false',
                },
                signal: controller.signal,
                body: JSON.stringify({
                    max_tokens: MAX_OUTPUT_TOKENS,
                    temperature: 0,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: `${DOCUMENT_EXTRACTION_PROMPT}\n${DOCUMENT_JSON_CONTRACT_HINT}` },
                                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` } },
                            ],
                        },
                    ],
                }),
            });

            if (!response.ok) {
                if (response.status === 429 || response.status >= 500) {
                    this.logger.error(`Cloudflare document extraction unavailable (http_${response.status}).`);
                    throw new CloudflareExtractionUnavailableError();
                }
                this.logger.error(`Cloudflare document extraction failed (http_${response.status}).`);
                return null;
            }

            const body = (await response.json()) as CloudflareAiResponse;
            if (body?.success === false) {
                const codes = (body.errors ?? []).map((e) => e?.code ?? 'unknown').join(',');
                this.logger.error(`Cloudflare document extraction failed (api_error codes=${codes || 'none'}).`);
                return null;
            }

            const text = this.readCompletion(body);
            const parsed = salvageJsonObject(text);
            if (!parsed?.detected || !KNOWN_DOCUMENT_TYPES.has(parsed.document_type as string)) {
                return null;
            }

            return {
                detected: true,
                document_type: parsed.document_type as string,
                confidence: ['high', 'medium', 'low'].includes(parsed.confidence as string) ? (parsed.confidence as ParseResult['confidence']) : 'low',
                fields: (parsed.fields as ParseResult['fields']) ?? {},
                warnings: Array.isArray(parsed.warnings) ? (parsed.warnings as string[]) : [],
            };
        } catch (err) {
            if (err instanceof CloudflareExtractionUnavailableError) throw err;
            if (this.isTransient(err)) {
                this.logger.error(`Cloudflare document extraction unreachable (${err instanceof Error ? err.name : 'unknown'}).`);
                throw new CloudflareExtractionUnavailableError();
            }
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Cloudflare document extraction failed: ${message}`);
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    private endpoint(): string {
        const base = this.gatewayUrl ?? `${WORKERS_AI_BASE}/${this.accountId}/ai/run`;
        return `${base}/${this.model}`;
    }

    /**
     * Workers AI returns `{ result: { response: "..." } }`; models served through
     * the OpenAI-compatible shape return `choices[0].message.content` instead.
     * The model id is operator-configurable, so accept either.
     */
    private readCompletion(body: CloudflareAiResponse): string | undefined {
        const result = body?.result;
        if (typeof result?.response === 'string') return result.response;
        const choice = result?.choices?.[0] ?? body?.choices?.[0];
        const content = choice?.message?.content;
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content
                .map((part) => (typeof part?.text === 'string' ? part.text : ''))
                .join('')
                .trim();
        }
        return undefined;
    }

    /** Network-level failures and aborts — transient, not "unreadable document". */
    private isTransient(err: unknown): boolean {
        if (!(err instanceof Error)) return false;
        return err.name === 'AbortError' || err.name === 'TimeoutError' || err.name === 'TypeError' || err.name === 'FetchError';
    }
}

interface CloudflareAiChoice {
    message?: { content?: string | { text?: string }[] };
}

interface CloudflareAiResponse {
    success?: boolean;
    errors?: { code?: number | string; message?: string }[];
    result?: { response?: string; choices?: CloudflareAiChoice[] };
    choices?: CloudflareAiChoice[];
}
