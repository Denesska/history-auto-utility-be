import { BadRequestException, Injectable, Logger, ServiceUnavailableException, UnsupportedMediaTypeException } from '@nestjs/common';
import { ExtractedFieldsDto, ExtractionResultDto } from './dto/extraction-result.dto';
import { DocumentParser } from './parsers/document-parser.interface';
import { RcaParser } from './parsers/rca.parser';
import { GeminiExtractionService, GeminiServiceUnavailableError } from './gemini-extraction.service';
import { AiUsageService } from '../ai-usage/ai-usage.service';
import { AiCallReport } from '../../common/ai/ai-call-report';
import { getRequestSessionContext } from '../../common/context/request-context';
import { CloudflareExtractionService, CloudflareExtractionUnavailableError } from './cloudflare-extraction.service';

const SUPPORTED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_RAW_TEXT_CHARS = 3000;
// If the free regex parser leaves any of these empty on a text PDF, the layout is one it doesn't
// know — escalate to AI extraction and merge, instead of returning a half-filled policy.
const RCA_CRITICAL_FIELDS = ['policy_number', 'valid_from', 'valid_until'] as const;
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

// The VIN alphabet excludes I, O and Q entirely, so any occurrence in a raw
// extracted value is guaranteed to be an OCR/AI misread of 1/0/0 — safe to
// always correct rather than just flag. Runs on every extraction path (the
// RCA regex parser already can't capture these, but the AI paths have no
// charset/length constraint on their output, which is how a malformed VIN
// like an 18-character misread reaches the frontend unfiltered).
function sanitizeVin(fields: Partial<ExtractedFieldsDto>, warnings: string[]): void {
    const raw = fields.vin;
    if (typeof raw !== 'string' || !raw.trim()) return;

    const cleaned = raw
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .replace(/O/g, '0')
        .replace(/I/g, '1')
        .replace(/Q/g, '0');

    if (VIN_PATTERN.test(cleaned)) {
        fields.vin = cleaned;
    } else {
        delete fields.vin;
        warnings.push(
            `VIN/chassis number could not be reliably extracted (found "${raw}", expected exactly 17 characters). Please verify manually.`,
        );
    }
}

@Injectable()
export class DocumentExtractionService {
    private readonly logger = new Logger(DocumentExtractionService.name);

    // Add more parsers here as new text-based document types are supported.
    private readonly parsers: DocumentParser[] = [new RcaParser()];

    constructor(
        private readonly geminiExtractionService: GeminiExtractionService,
        private readonly cloudflareExtractionService: CloudflareExtractionService,
        private readonly aiUsage: AiUsageService,
    ) {}

    async extract(buffer: Buffer, mimeType: string, userId: number | null = null): Promise<ExtractionResultDto> {
        if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
            throw new UnsupportedMediaTypeException(
                `File type "${mimeType}" is not supported for extraction. Supported formats: PDF, JPEG, PNG, WEBP.`,
            );
        }

        let rawText = '';
        // Regex-parser result that is missing critical fields: kept as the base for an AI merge,
        // and returned as-is if the AI step is unavailable (quota, outage).
        let partial: ExtractionResultDto | null = null;
        if (mimeType === 'application/pdf') {
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const pdfParse = require('pdf-parse');
                const pdfResult = await pdfParse(buffer);
                rawText = (pdfResult.text as string)?.trim() ?? '';
            } catch {
                throw new BadRequestException(
                    'Could not read the document. The file may be corrupted, empty, or password-protected.',
                );
            }

            if (rawText.length >= 50) {
                for (const parser of this.parsers) {
                    if (parser.canParse(rawText)) {
                        const result = parser.parse(rawText);
                        sanitizeVin(result.fields, result.warnings);
                        const parsed: ExtractionResultDto = {
                            detected: result.detected,
                            document_type: result.document_type,
                            confidence: result.confidence,
                            fields: result.fields,
                            warnings: result.warnings,
                            raw_text: rawText.slice(0, MAX_RAW_TEXT_CHARS),
                        };
                        if (RCA_CRITICAL_FIELDS.every(k => !!result.fields[k])) return parsed;
                        partial = parsed;
                        break;
                    }
                }
            }
        }

        try {
        // Fallback (or primary path for images / scanned PDFs / non-RCA document types): AI extraction.
        // Everything above (pdf-parse + regex parsers) is free and is neither counted nor limited.
        const ctx = getRequestSessionContext();
        const orgId = ctx?.type === 'business' ? ctx.orgId : null;
        const contentHash = this.aiUsage.hashBuffer(buffer);
        if (userId !== null) {
            // A repeat upload of the same file is free: serve the stored result, no quota check.
            const cached = await this.aiUsage.getCached<ExtractionResultDto>(userId, 'document_extract', contentHash);
            if (cached) return cached;
        }
        // One quota check per request (throws 429); each provider call is then recorded separately.
        await this.aiUsage.assertQuota('document_extract', userId, orgId);

        const record = (provider: 'gemini' | 'cloudflare') => (r: AiCallReport) =>
            void this.aiUsage.record({ feature: 'document_extract', userId, orgId, provider, ...r });

        let aiResult;
        try {
            aiResult = await this.geminiExtractionService.extract(buffer, mimeType, record('gemini'));
        } catch (err) {
            if (!(err instanceof GeminiServiceUnavailableError)) throw err;

            // Gemini itself is down (503/overloaded) — try the Cloudflare adapter as a
            // hot backup before giving up. It only handles image mime types (no PDF),
            // so a null return here can also mean "can't help with this file" rather
            // than "ran and found nothing" — either way falling through to the
            // "not detected, fill in manually" response below is the right outcome.
            this.logger.warn('Gemini unavailable — retrying extraction via Cloudflare fallback.');
            try {
                aiResult = await this.cloudflareExtractionService.extract(buffer, mimeType, record('cloudflare'));
            } catch (fallbackErr) {
                if (fallbackErr instanceof CloudflareExtractionUnavailableError) {
                    throw new ServiceUnavailableException(
                        'The document analysis service is temporarily overloaded. Please try again in a few minutes, or fill in the fields manually.',
                    );
                }
                throw fallbackErr;
            }
        }
        if (aiResult) {
            sanitizeVin(aiResult.fields, aiResult.warnings);
            const result: ExtractionResultDto = {
                detected: aiResult.detected,
                document_type: aiResult.document_type,
                confidence: aiResult.confidence,
                // Regex values (deterministic) win where present; the AI fills the gaps.
                fields: partial ? { ...aiResult.fields, ...partial.fields } : aiResult.fields,
                warnings: aiResult.warnings,
                raw_text: rawText ? rawText.slice(0, MAX_RAW_TEXT_CHARS) : undefined,
            };
            // Only successful extractions that actually found something are cached.
            if (userId !== null && result.detected && Object.keys(result.fields ?? {}).length > 0) {
                await this.aiUsage.setCached(userId, 'document_extract', contentHash, result);
            }
            return result;
        }
        } catch (err) {
            // The regex parser already got most of the policy; a quota/outage error on the AI
            // top-up shouldn't throw that away.
            if (partial) return partial;
            throw err;
        }

        if (partial) return partial;
        return {
            detected: false,
            document_type: null,
            confidence: 'none',
            fields: {},
            warnings: [
                'Document type could not be detected or is not supported yet. ' +
                'Currently supported: RCA, ITP, road vignette (rovinietă), registration certificate, road tax, fuel receipt, EV charging receipt, odometer photo.',
            ],
            raw_text: rawText ? rawText.slice(0, MAX_RAW_TEXT_CHARS) : undefined,
        };
    }
}
