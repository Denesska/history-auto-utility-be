import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { IdentityExtractionProvider, IdentityExtractionResult, IdentityExtractionUnavailableError } from '../sale-contract.types';
import { IDENTITY_EXTRACTION_PROMPT, IDENTITY_RESPONSE_JSON_SCHEMA } from './identity-extraction.prompt';
import { notAnIdentityDocument, sanitizeIdentityPayload, toResult, toSupportedMimeType, UNSUPPORTED_IMAGE_WARNING } from './identity-response.util';
import { redactText } from '../../../common/crypto/redact.util';

const DEFAULT_MODEL = 'claude-haiku-4-5';

/**
 * Newer Claude models removed the sampling parameters (`temperature` etc.) and
 * return a 400 if they are sent. The default model below still accepts
 * `temperature: 0`, which is what we want for a deterministic extraction — but
 * the model is operator-overridable, so drop the parameter when the override
 * names a family that rejects it rather than failing every request.
 */
const NO_SAMPLING_PARAMS = /^claude-(opus-(4-6|4-7|4-8|5)|sonnet-(4-6|5)|fable|mythos)/;

const MAX_OUTPUT_TOKENS = 2048;
const REQUEST_TIMEOUT_MS = 90_000;

/**
 * Identity-document extraction through the Anthropic API.
 *
 * Deliberately separate from GeminiExtractionService: the rest of the app runs
 * on Gemini's free tier, whose terms allow the provider to train on submitted
 * data. Identity documents must go through a paid provider instead, so this
 * adapter has its own key, its own model setting and its own module.
 *
 * Model: claude-haiku-4-5 by default. This is a narrow, high-volume extraction
 * task with a fixed schema, so the cheapest capable model is the right call —
 * cost per generated contract matters. Override with ANTHROPIC_IDENTITY_MODEL
 * when A/B testing a larger model on worn cards.
 *
 * A missing ANTHROPIC_API_KEY disables the provider rather than crashing
 * bootstrap, matching GeminiExtractionService.
 *
 * Nothing extracted is ever logged. Third-party error messages can echo back
 * request content, so they go through redactText before they reach the logger.
 * The image buffer is never written to disk or object storage — it lives in
 * memory for the duration of this call and is then dropped.
 */
@Injectable()
export class ClaudeIdentityProvider implements IdentityExtractionProvider {
    readonly name = 'claude';

    private readonly logger = new Logger(ClaudeIdentityProvider.name);
    private readonly client: Anthropic | null;
    private readonly model: string;

    constructor(private readonly config: ConfigService) {
        const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
        this.model = this.config.get<string>('ANTHROPIC_IDENTITY_MODEL') || DEFAULT_MODEL;
        this.client = apiKey ? new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS }) : null;

        if (!this.client) {
            this.logger.warn('ANTHROPIC_API_KEY is not set — Claude identity extraction is disabled.');
        }
    }

    isConfigured(): boolean {
        return this.client !== null;
    }

    async extract(image: Buffer, mimeType: string): Promise<IdentityExtractionResult | null> {
        if (!this.client) return null;

        const mediaType = toSupportedMimeType(mimeType);
        if (!mediaType) {
            this.logger.warn(`[${this.name}] unsupported image mime type rejected before upload.`);
            return notAnIdentityDocument(this.name, UNSUPPORTED_IMAGE_WARNING);
        }

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: MAX_OUTPUT_TOKENS,
                ...(NO_SAMPLING_PARAMS.test(this.model) ? {} : { temperature: 0 }),
                // Structured outputs: the API constrains generation to the schema,
                // so the body is schema-valid JSON rather than "hopefully parseable".
                output_config: { format: { type: 'json_schema', schema: IDENTITY_RESPONSE_JSON_SCHEMA as unknown as Record<string, unknown> } },
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image.toString('base64') } },
                            { type: 'text', text: IDENTITY_EXTRACTION_PROMPT },
                        ],
                    },
                ],
            });

            if (response.stop_reason === 'refusal') {
                // Not an outage and not a bad document — the model declined. Surface
                // it as "not recognised" so the user can type the fields instead.
                this.logger.warn(`[${this.name}] request refused by the model.`);
                return notAnIdentityDocument(this.name, 'Documentul nu a putut fi procesat automat. Completeaza datele manual.');
            }

            const text = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')?.text;
            if (!text) {
                this.logger.warn(`[${this.name}] response contained no text block (stop_reason=${response.stop_reason}).`);
                return notAnIdentityDocument(this.name, 'Documentul nu a putut fi citit. Completeaza datele manual.');
            }

            let parsed: Record<string, unknown>;
            try {
                parsed = JSON.parse(text);
            } catch {
                // Should be impossible with output_config.format, but a truncated
                // response (stop_reason "max_tokens") can still break the JSON.
                this.logger.warn(`[${this.name}] response was not valid JSON (stop_reason=${response.stop_reason}).`);
                return notAnIdentityDocument(this.name, 'Documentul nu a putut fi citit. Completeaza datele manual.');
            }

            // Lenient mode: the schema already guarantees types, and a well-formed
            // but misread CNP must survive to the checksum check in the service.
            const payload = sanitizeIdentityPayload(parsed, { strict: false });
            this.logger.log(`[${this.name}] extraction finished: detected=${payload.detected} confidence=${payload.confidence} fields=${Object.keys(payload.fields).length} warnings=${payload.warnings.length}`);
            return toResult(payload, this.name);
        } catch (err) {
            if (this.isTransient(err)) {
                this.logger.error(`[${this.name}] provider unavailable (${this.describeCategory(err)}).`);
                throw new IdentityExtractionUnavailableError(this.name);
            }
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`[${this.name}] extraction failed (${this.describeCategory(err)}): ${redactText(message)}`);
            return null;
        }
    }

    /**
     * Rate limits, 5xx/overload (529) and connection failures are all transient:
     * the caller should answer 503 rather than tell the user their ID card is
     * unreadable. Everything else (400 bad request, 401 bad key, 413 too large)
     * is our bug or our configuration and must not masquerade as an outage.
     */
    private isTransient(err: unknown): boolean {
        if (err instanceof Anthropic.APIConnectionError) return true;
        if (err instanceof Anthropic.RateLimitError) return true;
        if (err instanceof Anthropic.InternalServerError) return true;
        if (err instanceof Anthropic.APIError) {
            const status = err.status;
            return typeof status === 'number' && (status === 429 || status >= 500);
        }
        return false;
    }

    /** Error category only — never the body, which may echo the document back. */
    private describeCategory(err: unknown): string {
        if (err instanceof Anthropic.APIConnectionError) return 'connection';
        if (err instanceof Anthropic.APIError) return `http_${err.status ?? 'unknown'}`;
        return err instanceof Error ? err.name : 'unknown';
    }
}
