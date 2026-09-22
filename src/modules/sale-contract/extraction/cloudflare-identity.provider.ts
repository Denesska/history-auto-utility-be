import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityExtractionProvider, IdentityExtractionResult, IdentityExtractionUnavailableError } from '../sale-contract.types';
import { IDENTITY_EXTRACTION_PROMPT, IDENTITY_JSON_CONTRACT_HINT } from './identity-extraction.prompt';
import { notAnIdentityDocument, salvageJsonObject, sanitizeIdentityPayload, toResult, toSupportedMimeType, UNSUPPORTED_IMAGE_WARNING } from './identity-response.util';
import { redactText } from '../../../common/crypto/redact.util';

const WORKERS_AI_BASE = 'https://api.cloudflare.com/client/v4/accounts';
const DEFAULT_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const MAX_OUTPUT_TOKENS = 2048;
const REQUEST_TIMEOUT_MS = 90_000;

const UNREADABLE_WARNING = 'Documentul nu a putut fi citit automat. Completeaza datele manual.';

/**
 * Identity-document extraction through Cloudflare Workers AI, over REST.
 *
 * This is the second, swappable adapter for the same job — the vendor for
 * identity documents is not finally decided, so both adapters implement the
 * same prompt and the same envelope and are selected at runtime by
 * IDENTITY_EXTRACTION_PROVIDER for A/B testing on real ID photos.
 *
 * Open-weight vision models are markedly weaker than a frontier model at OCR of
 * a non-English document and at honouring a JSON contract, and Workers AI does
 * not constrain generation to a schema. So everything here is defensive: the
 * response may arrive wrapped in prose or a markdown fence, may contain the
 * schema's own placeholder strings instead of values, or may be unusable
 * altogether — in which case we return `detected: false` with a warning rather
 * than throwing or passing garbage upward.
 *
 * Nothing extracted is ever logged, and the image buffer is never persisted.
 */
@Injectable()
export class CloudflareIdentityProvider implements IdentityExtractionProvider {
    readonly name = 'cloudflare';

    private readonly logger = new Logger(CloudflareIdentityProvider.name);
    private readonly accountId: string | undefined;
    private readonly token: string | undefined;
    private readonly model: string;
    private readonly gatewayUrl: string | undefined;

    constructor(private readonly config: ConfigService) {
        this.accountId = this.config.get<string>('CLOUDFLARE_ACCOUNT_ID')?.trim() || undefined;
        this.token = this.config.get<string>('CLOUDFLARE_AI_TOKEN')?.trim() || undefined;
        this.model = this.config.get<string>('CLOUDFLARE_VISION_MODEL')?.trim() || DEFAULT_MODEL;

        // Optional Cloudflare AI Gateway base-URL override, e.g.
        // https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway>/workers-ai
        //
        // WARNING: AI Gateway stores full request and response logs BY DEFAULT.
        // These payloads are identity-card images, names, addresses and CNPs.
        // Log storage MUST be disabled for this route (Gateway settings → Logs →
        // off, or `cf-aig-collect-log: false`) before this override is used in
        // any environment that sees real documents.
        this.gatewayUrl = this.config.get<string>('CLOUDFLARE_AI_GATEWAY_URL')?.trim().replace(/\/+$/, '') || undefined;

        if (!this.isConfigured()) {
            this.logger.warn('CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_AI_TOKEN are not set — Cloudflare identity extraction is disabled.');
        }
    }

    isConfigured(): boolean {
        return Boolean(this.token && (this.accountId || this.gatewayUrl));
    }

    async extract(image: Buffer, mimeType: string): Promise<IdentityExtractionResult | null> {
        if (!this.isConfigured()) return null;

        const mediaType = toSupportedMimeType(mimeType);
        if (!mediaType) {
            this.logger.warn(`[${this.name}] unsupported image mime type rejected before upload.`);
            return notAnIdentityDocument(this.name, UNSUPPORTED_IMAGE_WARNING);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(this.endpoint(), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                    // Belt and braces alongside the gateway setting above.
                    //
                    // Two headers rather than one, because they are not the same
                    // trade-off: 'cf-aig-collect-log: false' drops the log entry
                    // entirely — including the token counts and cost we want for
                    // the provider A/B — while 'cf-aig-collect-log-payload: false'
                    // keeps that metadata and drops only the request and response
                    // bodies, which here are the identity-card image and the
                    // extracted CNP. Sending both means that if the gateway's own
                    // setting ever re-enables logging, the payload stays out
                    // regardless of which switch is honoured.
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
                                { type: 'text', text: `${IDENTITY_EXTRACTION_PROMPT}\n${IDENTITY_JSON_CONTRACT_HINT}` },
                                { type: 'image_url', image_url: { url: `data:${mediaType};base64,${image.toString('base64')}` } },
                            ],
                        },
                    ],
                }),
            });

            if (!response.ok) {
                if (response.status === 429 || response.status >= 500) {
                    this.logger.error(`[${this.name}] provider unavailable (http_${response.status}).`);
                    throw new IdentityExtractionUnavailableError(this.name);
                }
                this.logger.error(`[${this.name}] extraction failed (http_${response.status}).`);
                return null;
            }

            const body = (await response.json()) as CloudflareAiResponse;
            if (body?.success === false) {
                const codes = (body.errors ?? []).map((e) => e?.code ?? 'unknown').join(',');
                this.logger.error(`[${this.name}] extraction failed (api_error codes=${codes || 'none'}).`);
                return null;
            }

            const text = this.readCompletion(body);
            const parsed = salvageJsonObject(text);
            if (!parsed) {
                // Unsalvageable — the model answered in prose, refused, or emitted
                // broken JSON. Not an outage, so don't throw: tell the user to type
                // the fields in.
                this.logger.warn(`[${this.name}] response could not be parsed as JSON; returning "not detected".`);
                return notAnIdentityDocument(this.name, UNREADABLE_WARNING);
            }

            // Strict mode: drop values that cannot be right for their field rather
            // than letting a hallucinated CNP reach the contract.
            const payload = sanitizeIdentityPayload(parsed, { strict: true });
            this.logger.log(`[${this.name}] extraction finished: detected=${payload.detected} confidence=${payload.confidence} fields=${Object.keys(payload.fields).length} warnings=${payload.warnings.length}`);

            if (!payload.detected && payload.warnings.length === 0) {
                return notAnIdentityDocument(this.name, UNREADABLE_WARNING);
            }
            return toResult(payload, this.name);
        } catch (err) {
            if (err instanceof IdentityExtractionUnavailableError) throw err;
            if (this.isTransient(err)) {
                this.logger.error(`[${this.name}] provider unreachable (${err instanceof Error ? err.name : 'unknown'}).`);
                throw new IdentityExtractionUnavailableError(this.name);
            }
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`[${this.name}] extraction failed: ${redactText(message)}`);
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
