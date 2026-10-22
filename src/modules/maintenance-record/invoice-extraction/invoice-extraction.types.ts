import { PlanItemKey } from '@prisma/client';

export const INVOICE_SERVICE_TYPES = ['REPAIR', 'MAINTENANCE', 'IMPROVEMENT', 'PASSION'] as const;
export const INVOICE_SERVICE_CATEGORIES = [
    'OIL_CHANGE', 'BRAKE_SERVICE', 'TRANSMISSION_SERVICE', 'TIRE_SERVICE', 'FLUID_SERVICE',
    'ENGINE_SERVICE', 'INSPECTION', 'BATTERY_SERVICE', 'FILTER_SERVICE', 'LIGHT_SERVICE', 'OTHER',
] as const;
export const INVOICE_CURRENCIES = ['RON', 'EUR', 'USD', 'MDL'] as const;
export const INVOICE_DOCUMENT_KINDS = ['parts_invoice', 'service_report', 'receipt', 'other', 'unreadable'] as const;
export const INVOICE_WARNING_CODES = [
    'TOTAL_MISMATCH', 'MIXED_CURRENCY', 'DUPLICATES_MERGED', 'UNREADABLE_DOCUMENT', 'MISSING_PRICES', 'VAT_UNCLEAR',
] as const;

export type InvoiceServiceType = (typeof INVOICE_SERVICE_TYPES)[number];
export type InvoiceServiceCategory = (typeof INVOICE_SERVICE_CATEGORIES)[number];
export type InvoiceCurrency = (typeof INVOICE_CURRENCIES)[number];
export type InvoiceDocumentKind = (typeof INVOICE_DOCUMENT_KINDS)[number];
export type InvoiceWarningCode = (typeof INVOICE_WARNING_CODES)[number];

export type RawLineKind = 'part' | 'labor' | 'discount' | 'other_charge';

/** One line item exactly as printed on a document (raw model output, never trusted for math). */
export interface RawInvoiceLine {
    kind: RawLineKind;
    name: string;
    code?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    line_total?: number | null;
    /** Model flag: this line repeats a part that is listed (usually priced) on another uploaded document. */
    duplicates_other_document?: boolean | null;
}

export interface RawInvoiceDocument {
    index: number;
    kind: InvoiceDocumentKind;
    supplier_name?: string | null;
    number?: string | null;
    date?: string | null;
    currency?: string | null;
    /** Whether the printed line prices already include VAT. */
    prices_basis?: 'gross' | 'net' | 'unknown' | null;
    vat_rate?: number | null;
    vat_amount?: number | null;
    net_total?: number | null;
    /** Printed grand total (what is to be paid, VAT included). */
    grand_total?: number | null;
    /** Document-level discount not itemised as a line (positive number). */
    discount_total?: number | null;
    lines?: RawInvoiceLine[] | null;
}

export interface RawInvoiceExtraction {
    detected: boolean;
    service_type?: string | null;
    service_category?: string | null;
    plan_items?: string[] | null;
    custom_items?: string[] | null;
    title?: string | null;
    notes?: string | null;
    mileage?: number | null;
    documents?: RawInvoiceDocument[] | null;
}

export interface InvoicePart {
    name: string;
    code: string | null;
    quantity: number;
    unit_price: number | null;
    total: number | null;
    source: number;
}
export interface InvoiceLabor {
    description: string;
    amount: number;
    source: number;
}
export interface InvoiceTotals {
    parts: number;
    labor: number;
    other: number;
    discount: number;
    grand_total: number;
    documents_total: number | null;
}
export interface InvoiceDocumentSummary {
    index: number;
    kind: InvoiceDocumentKind;
    supplier_name: string | null;
    number: string | null;
    date: string | null;
    total: number | null;
    currency: string | null;
}
export interface InvoiceWarning {
    code: InvoiceWarningCode;
    params?: Record<string, string | number>;
}

export interface InvoiceExtractionResult {
    detected: boolean;
    service_type: InvoiceServiceType | null;
    service_category: InvoiceServiceCategory | null;
    /** Plan items the invoice shows were done (valid enum values, deduped, applicable to the car). */
    plan_items: PlanItemKey[];
    /** Short free-text labels for work that maps to no plan item (max 5, each <= 40 chars). */
    custom_items: string[];
    title: string | null;
    notes: string | null;
    service_date: string | null;
    mileage: number | null;
    supplier_name: string | null;
    currency: InvoiceCurrency;
    parts: InvoicePart[];
    labor: InvoiceLabor[];
    totals: InvoiceTotals;
    documents: InvoiceDocumentSummary[];
    warnings: InvoiceWarning[];
}
