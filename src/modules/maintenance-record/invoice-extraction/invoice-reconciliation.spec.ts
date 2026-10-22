import { reconcileInvoiceExtraction } from './invoice-reconciliation';
import { RawInvoiceExtraction } from './invoice-extraction.types';

const base = { detected: true, service_type: 'MAINTENANCE', service_category: 'OIL_CHANGE', title: 'Revizie' };
const codes = (r: ReturnType<typeof reconcileInvoiceExtraction>) => r.warnings.map((w) => w.code);

describe('reconcileInvoiceExtraction', () => {
    it('merges parts repeated on the service report and keeps labor', () => {
        const raw: RawInvoiceExtraction = {
            ...base,
            documents: [
                {
                    index: 0, kind: 'parts_invoice', supplier_name: 'AutoShop', number: 'F1', date: '2026-10-01', currency: 'RON', prices_basis: 'gross',
                    grand_total: 300,
                    lines: [
                        { kind: 'part', name: 'Ulei 5W-30', code: 'OIL1', quantity: 2, unit_price: 100, line_total: 200 },
                        { kind: 'part', name: 'Filtru ulei', code: 'FU9', quantity: 1, unit_price: 100, line_total: 100 },
                    ],
                },
                {
                    index: 1, kind: 'service_report', supplier_name: 'Service SRL', number: 'D7', date: '2026-10-03', currency: 'RON', prices_basis: 'gross',
                    grand_total: 150,
                    lines: [
                        { kind: 'part', name: 'ulei 5w30', code: 'OIL1', quantity: 2, unit_price: 0, line_total: 0, duplicates_other_document: true },
                        { kind: 'part', name: 'Filtru ulei', quantity: 1, line_total: null, duplicates_other_document: true },
                        { kind: 'labor', name: 'Manopera schimb ulei', line_total: 150 },
                    ],
                },
            ],
        };
        const r = reconcileInvoiceExtraction(raw, { fileCount: 2 });
        expect(r.parts).toHaveLength(2);
        expect(r.parts.every((p) => p.source === 0)).toBe(true);
        expect(r.labor).toEqual([{ description: 'Manopera schimb ulei', amount: 150, source: 1 }]);
        expect(r.totals).toMatchObject({ parts: 300, labor: 150, discount: 0, grand_total: 450, documents_total: 450 });
        expect(r.service_date).toBe('2026-10-03');
        expect(r.supplier_name).toBe('Service SRL');
        expect(r.warnings).toContainEqual({ code: 'DUPLICATES_MERGED', params: { count: 2 } });
        expect(codes(r)).not.toContain('TOTAL_MISMATCH');
        expect(codes(r)).not.toContain('MISSING_PRICES');
    });

    it('scales net prices to gross using the printed grand total', () => {
        const raw: RawInvoiceExtraction = {
            ...base,
            documents: [{
                index: 0, kind: 'parts_invoice', currency: 'RON', prices_basis: 'net', vat_rate: 19, net_total: 100, vat_amount: 19, grand_total: 119,
                lines: [{ kind: 'part', name: 'Placute frana', quantity: 1, unit_price: 100, line_total: 100 }],
            }],
        };
        const r = reconcileInvoiceExtraction(raw, { fileCount: 1 });
        expect(r.parts[0].total).toBe(119);
        expect(r.totals.grand_total).toBe(119);
        expect(codes(r)).not.toContain('VAT_UNCLEAR');
    });

    it('flags VAT_UNCLEAR when net prices cannot be grossed up', () => {
        const raw: RawInvoiceExtraction = {
            ...base,
            documents: [{ index: 0, kind: 'receipt', currency: 'RON', prices_basis: 'net', lines: [{ kind: 'part', name: 'Bec', line_total: 10 }] }],
        };
        const r = reconcileInvoiceExtraction(raw, { fileCount: 1 });
        expect(r.totals.grand_total).toBe(10);
        expect(codes(r)).toContain('VAT_UNCLEAR');
    });

    it('subtracts discounts', () => {
        const raw: RawInvoiceExtraction = {
            ...base,
            documents: [{
                index: 0, kind: 'parts_invoice', currency: 'RON', prices_basis: 'gross', grand_total: 180,
                lines: [
                    { kind: 'part', name: 'Disc frana', quantity: 2, unit_price: 100 },
                    { kind: 'discount', name: 'Discount 10%', line_total: 20 },
                ],
            }],
        };
        const r = reconcileInvoiceExtraction(raw, { fileCount: 1 });
        expect(r.totals).toMatchObject({ parts: 200, discount: 20, grand_total: 180, documents_total: 180 });
        expect(codes(r)).not.toContain('TOTAL_MISMATCH');
    });

    it('warns on total mismatch, missing prices, unreadable files and identical duplicate uploads', () => {
        const doc = {
            kind: 'parts_invoice' as const, number: 'F5', currency: 'RON', prices_basis: 'gross' as const, grand_total: 500,
            lines: [{ kind: 'part' as const, name: 'Amortizor', line_total: 200 }, { kind: 'part' as const, name: 'Arc', line_total: null }],
        };
        const raw: RawInvoiceExtraction = { ...base, documents: [{ index: 0, ...doc }, { index: 1, ...doc }, { index: 2, kind: 'unreadable' }] };
        const r = reconcileInvoiceExtraction(raw, { fileCount: 3 });
        expect(r.totals.documents_total).toBe(500);
        expect(r.totals.grand_total).toBe(200);
        expect(r.warnings).toContainEqual({ code: 'TOTAL_MISMATCH', params: { computed: 200, documents: 500 } });
        expect(r.warnings).toContainEqual({ code: 'MISSING_PRICES', params: { count: 1 } });
        expect(r.warnings).toContainEqual({ code: 'UNREADABLE_DOCUMENT', params: { index: 2 } });
        expect(r.warnings).toContainEqual({ code: 'DUPLICATES_MERGED', params: { count: 1 } });
    });

    it('converts mixed currencies to RON when rates are available, otherwise keeps majority', () => {
        const raw: RawInvoiceExtraction = {
            ...base,
            documents: [
                { index: 0, kind: 'parts_invoice', currency: 'EUR', prices_basis: 'gross', grand_total: 10, lines: [{ kind: 'part', name: 'A', line_total: 10 }] },
                { index: 1, kind: 'service_report', currency: 'RON', prices_basis: 'gross', grand_total: 50, lines: [{ kind: 'labor', name: 'M', line_total: 50 }] },
            ],
        };
        const conv = reconcileInvoiceExtraction(raw, { fileCount: 2, ronRates: { 0: 5 } });
        expect(conv.currency).toBe('RON');
        expect(conv.totals.grand_total).toBe(100);
        const noRate = reconcileInvoiceExtraction(raw, { fileCount: 2 });
        expect(noRate.totals.grand_total).toBe(60);
        expect(codes(noRate)).toContain('MIXED_CURRENCY');
    });
});
