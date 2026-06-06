import { ExtractedFieldsDto } from '../dto/extraction-result.dto';

export interface ParseResult {
    detected: boolean;
    document_type: string;
    confidence: 'high' | 'medium' | 'low';
    fields: Partial<ExtractedFieldsDto>;
    warnings: string[];
}

export interface DocumentParser {
    canParse(text: string): boolean;
    parse(text: string): ParseResult;
}
