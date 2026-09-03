import { BadRequestException, Injectable, ServiceUnavailableException, UnsupportedMediaTypeException } from '@nestjs/common';
import { ExtractionResultDto } from './dto/extraction-result.dto';
import { DocumentParser } from './parsers/document-parser.interface';
import { RcaParser } from './parsers/rca.parser';
import { GeminiExtractionService, GeminiServiceUnavailableError } from './gemini-extraction.service';

const SUPPORTED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_RAW_TEXT_CHARS = 3000;

@Injectable()
export class DocumentExtractionService {
    // Add more parsers here as new text-based document types are supported.
    private readonly parsers: DocumentParser[] = [new RcaParser()];

    constructor(private readonly geminiExtractionService: GeminiExtractionService) {}

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
            if (err instanceof GeminiServiceUnavailableError) {
                throw new ServiceUnavailableException(
                    'The document analysis service is temporarily overloaded. Please try again in a few minutes, or fill in the fields manually.',
                );
            }
            throw err;
        }
        if (aiResult) {
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
                'Currently supported: RCA, ITP, road vignette (rovinietă), registration certificate, road tax, fuel receipt, odometer photo.',
            ],
            raw_text: rawText ? rawText.slice(0, MAX_RAW_TEXT_CHARS) : undefined,
        };
    }
}
