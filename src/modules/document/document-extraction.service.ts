import { BadRequestException, Injectable, UnsupportedMediaTypeException } from '@nestjs/common';
import { ExtractionResultDto } from './dto/extraction-result.dto';
import { DocumentParser } from './parsers/document-parser.interface';
import { RcaParser } from './parsers/rca.parser';

const SUPPORTED_MIME_TYPES = new Set(['application/pdf']);
const MAX_RAW_TEXT_CHARS = 3000;

@Injectable()
export class DocumentExtractionService {
    // Add more parsers here as new document types are supported.
    private readonly parsers: DocumentParser[] = [new RcaParser()];

    async extract(buffer: Buffer, mimeType: string): Promise<ExtractionResultDto> {
        if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
            throw new UnsupportedMediaTypeException(
                `File type "${mimeType}" is not supported for extraction. Supported formats: PDF.`,
            );
        }

        let rawText: string;
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const pdfParse = require('pdf-parse');
            const pdfResult = await pdfParse(buffer);
            rawText = pdfResult.text as string;
        } catch {
            throw new BadRequestException(
                'Could not read the document. The file may be corrupted, empty, or password-protected.',
            );
        }

        const trimmedText = rawText?.trim() ?? '';

        if (trimmedText.length < 50) {
            return {
                detected: false,
                document_type: null,
                confidence: 'none',
                fields: {},
                warnings: [
                    'The document contains no readable text. It may be a scanned image. ' +
                    'OCR (optical character recognition) is not yet supported — please use a text-based PDF.',
                ],
                raw_text: rawText?.slice(0, MAX_RAW_TEXT_CHARS),
            };
        }

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

        return {
            detected: false,
            document_type: null,
            confidence: 'none',
            fields: {},
            warnings: [
                'Document type could not be detected or is not supported yet. ' +
                'Currently supported: RCA (Romanian car insurance).',
            ],
            raw_text: rawText.slice(0, MAX_RAW_TEXT_CHARS),
        };
    }
}
