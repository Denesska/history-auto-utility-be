import { BadRequestException, Injectable, Logger, ServiceUnavailableException, UnsupportedMediaTypeException } from '@nestjs/common';
import { ExtractedFieldsDto, ExtractionResultDto } from './dto/extraction-result.dto';
import { DocumentParser } from './parsers/document-parser.interface';
import { RcaParser } from './parsers/rca.parser';
import { GeminiExtractionService, GeminiServiceUnavailableError } from './gemini-extraction.service';
import { CloudflareExtractionService, CloudflareExtractionUnavailableError } from './cloudflare-extraction.service';

const SUPPORTED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_RAW_TEXT_CHARS = 3000;
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
    ) {}

    async extract(buffer: Buffer, mimeType: string): Promise<ExtractionResultDto> {
        if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
            throw new UnsupportedMediaTypeException(
                `File type "${mimeType}" is not supported for extraction. Supported formats: PDF, JPEG, PNG, WEBP.`,
            );
        }

        let rawText = '';
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
                        return {
                            detected: result.detected,
                            document_type: result.document_type,
                            confidence: result.confidence,
                            fields: result.fields,
                            warnings: result.warnings,
                            raw_text: rawText.slice(0, MAX_RAW_TEXT_CHARS),
                        };
                    }
                }
            }
        }

        // Fallback (or primary path for images / scanned PDFs / non-RCA document types): AI extraction.
        let aiResult;
        try {
            aiResult = await this.geminiExtractionService.extract(buffer, mimeType);
        } catch (err) {
            if (!(err instanceof GeminiServiceUnavailableError)) throw err;

            // Gemini itself is down (503/overloaded) — try the Cloudflare adapter as a
            // hot backup before giving up. It only handles image mime types (no PDF),
            // so a null return here can also mean "can't help with this file" rather
            // than "ran and found nothing" — either way falling through to the
            // "not detected, fill in manually" response below is the right outcome.
            this.logger.warn('Gemini unavailable — retrying extraction via Cloudflare fallback.');
            try {
                aiResult = await this.cloudflareExtractionService.extract(buffer, mimeType);
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
            return {
                detected: aiResult.detected,
                document_type: aiResult.document_type,
                confidence: aiResult.confidence,
                fields: aiResult.fields,
                warnings: aiResult.warnings,
                raw_text: rawText ? rawText.slice(0, MAX_RAW_TEXT_CHARS) : undefined,
            };
        }

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
