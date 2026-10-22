import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    INVOICE_CURRENCIES, INVOICE_DOCUMENT_KINDS, INVOICE_SERVICE_CATEGORIES, INVOICE_SERVICE_TYPES, INVOICE_WARNING_CODES,
} from './invoice-extraction.types';

export class InvoicePartDto {
    @ApiProperty() name: string;
    @ApiProperty({ nullable: true, type: String }) code: string | null;
    @ApiProperty() quantity: number;
    @ApiProperty({ nullable: true, type: Number }) unit_price: number | null;
    @ApiProperty({ nullable: true, type: Number }) total: number | null;
    @ApiProperty({ description: '0-based index of the uploaded file this line comes from.' }) source: number;
}

export class InvoiceLaborDto {
    @ApiProperty() description: string;
    @ApiProperty() amount: number;
    @ApiProperty() source: number;
}

export class InvoiceTotalsDto {
    @ApiProperty() parts: number;
    @ApiProperty() labor: number;
    @ApiProperty() other: number;
    @ApiProperty({ description: 'Positive number; subtracted in grand_total.' }) discount: number;
    @ApiProperty({ description: 'parts + labor + other - discount, 2 decimals. This is the cost for the form.' }) grand_total: number;
    @ApiProperty({ nullable: true, type: Number, description: "Sum of the documents' own printed grand totals (deduplicated)." }) documents_total: number | null;
}

export class InvoiceDocumentDto {
    @ApiProperty() index: number;
    @ApiProperty({ enum: INVOICE_DOCUMENT_KINDS }) kind: string;
    @ApiProperty({ nullable: true, type: String }) supplier_name: string | null;
    @ApiProperty({ nullable: true, type: String }) number: string | null;
    @ApiProperty({ nullable: true, type: String, description: 'YYYY-MM-DD' }) date: string | null;
    @ApiProperty({ nullable: true, type: Number }) total: number | null;
    @ApiProperty({ nullable: true, type: String }) currency: string | null;
}

export class InvoiceWarningDto {
    @ApiProperty({ enum: INVOICE_WARNING_CODES }) code: string;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) params?: Record<string, string | number>;
}

export class InvoiceExtractionResultDto {
    @ApiProperty() detected: boolean;
    @ApiProperty({ enum: INVOICE_SERVICE_TYPES, nullable: true, type: String }) service_type: string | null;
    @ApiProperty({ enum: INVOICE_SERVICE_CATEGORIES, nullable: true, type: String }) service_category: string | null;
    @ApiProperty({ nullable: true, type: String }) title: string | null;
    @ApiProperty({ nullable: true, type: String, description: 'Plain text, newline-separated lines.' }) notes: string | null;
    @ApiProperty({ nullable: true, type: String, description: 'YYYY-MM-DD' }) service_date: string | null;
    @ApiProperty({ nullable: true, type: Number }) mileage: number | null;
    @ApiProperty({ nullable: true, type: String }) supplier_name: string | null;
    @ApiProperty({ enum: INVOICE_CURRENCIES }) currency: string;
    @ApiProperty({ type: [InvoicePartDto] }) parts: InvoicePartDto[];
    @ApiProperty({ type: [InvoiceLaborDto] }) labor: InvoiceLaborDto[];
    @ApiProperty({ type: InvoiceTotalsDto }) totals: InvoiceTotalsDto;
    @ApiProperty({ type: [InvoiceDocumentDto] }) documents: InvoiceDocumentDto[];
    @ApiProperty({ type: [InvoiceWarningDto] }) warnings: InvoiceWarningDto[];
}
