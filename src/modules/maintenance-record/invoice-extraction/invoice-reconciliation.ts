import { PlanItemKey } from '@prisma/client';
import { sanitizeCustomItems } from '../custom-items.util';
import {
    INVOICE_CURRENCIES, INVOICE_DOCUMENT_KINDS, INVOICE_SERVICE_CATEGORIES, INVOICE_SERVICE_TYPES,
    InvoiceCurrency, InvoiceDocumentKind, InvoiceDocumentSummary, InvoiceExtractionResult, InvoiceLabor,
    InvoicePart, InvoiceWarning, RawInvoiceDocument, RawInvoiceExtraction, RawInvoiceLine,
} from './invoice-extraction.types';

export interface ReconcileOptions {
    /** Number of files that were uploaded; documents the model skipped are reported as unreadable. */
    fileCount: number;
    /** RON per 1 unit of foreign currency at each document's date, keyed by document index. Used only for mixed currencies. */
    ronRates?: Record<number, number | undefined>;
}

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const normKey = (s: string): string =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9а-яё]/g, '');

function normCurrency(v: unknown): InvoiceCurrency | null {
    const c = typeof v === 'string' ? v.trim().toUpperCase() : '';
    if (c === 'LEI' || c === 'RON') return 'RON';
    if (c === 'MDL') return 'MDL';
    return (INVOICE_CURRENCIES as readonly string[]).includes(c) ? (c as InvoiceCurrency) : null;
}

function normDate(v: unknown): string | null {
    const s = str(v);
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Line total: printed total wins; else qty x unit price. Printed also wins when both exist and disagree. */
export function lineTotal(line: RawInvoiceLine): { qty: number; unit: number | null; total: number | null } {
    const qty = num(line.quantity) && num(line.quantity)! > 0 ? num(line.quantity)! : 1;
    const unit = num(line.unit_price);
    const printed = num(line.line_total);
    let total: number | null = null;
    if (printed !== null) total = printed;
    else if (unit !== null) total = qty * unit;
    return { qty, unit, total: total === null ? null : r2(Math.abs(total)) };
}

interface ProcessedDoc {
    raw: RawInvoiceDocument;
    kind: InvoiceDocumentKind;
    currency: InvoiceCurrency | null;
    parts: (InvoicePart & { flaggedDup: boolean })[];
    labor: InvoiceLabor[];
    discount: number;
    grandTotal: number | null;
    vatUnclear: boolean;
    duplicateOfDoc: boolean;
}

/** Factor to turn the document's printed line prices into VAT-inclusive amounts. */
function grossFactor(doc: RawInvoiceDocument, linesSum: number): { factor: number; unclear: boolean } {
    const grand = num(doc.grand_total);
    const rate = num(doc.vat_rate);
    const vat = num(doc.vat_amount);
    const net = num(doc.net_total);
    const basis = doc.prices_basis ?? 'unknown';

    const fromTotals = (): number | null => {
        if (grand && linesSum > 0) {
            const f = grand / linesSum;
            if (f >= 0.99 && f <= 1.5) return f;
        }
        if (net && vat && net > 0) return (net + vat) / net;
        if (rate && rate > 0 && rate < 50) return 1 + rate / 100;
        return null;
    };

    if (basis === 'net') {
        const f = fromTotals();
        return f ? { factor: f, unclear: false } : { factor: 1, unclear: true };
    }
    if (basis === 'gross') return { factor: 1, unclear: false };
    // unknown: assume gross unless the numbers clearly say lines + VAT = grand total
    if (grand && linesSum > 0 && Math.abs(grand - linesSum) <= Math.max(1, 0.01 * grand)) return { factor: 1, unclear: false };
    if (grand && linesSum > 0 && rate && rate > 0 && Math.abs(linesSum * (1 + rate / 100) - grand) <= Math.max(1, 0.01 * grand)) {
        return { factor: 1 + rate / 100, unclear: false };
    }
    if (grand && linesSum > 0 && linesSum < grand * 0.99) {
        const f = fromTotals();
        return f ? { factor: f, unclear: false } : { factor: 1, unclear: true };
    }
    return { factor: 1, unclear: false };
}

function processDoc(doc: RawInvoiceDocument): ProcessedDoc {
    const kind = (INVOICE_DOCUMENT_KINDS as readonly string[]).includes(doc.kind) ? doc.kind : 'other';
    const out: ProcessedDoc = {
        raw: doc, kind, currency: normCurrency(doc.currency), parts: [], labor: [], discount: 0,
        grandTotal: num(doc.grand_total), vatUnclear: false, duplicateOfDoc: false,
    };
    if (kind === 'unreadable') return out;

    const lines = (doc.lines ?? []).filter((l) => l && (str(l.name) || num(l.line_total) !== null));
    const priced = lines.map((l) => ({ line: l, ...lineTotal(l) }));
    // Sum of the document's own positive lines, used to infer net vs gross.
    const linesSum = priced.reduce((s, p) => s + (p.line.kind === 'discount' ? -(p.total ?? 0) : p.total ?? 0), 0);
    const { factor, unclear } = grossFactor(doc, linesSum);
    out.vatUnclear = unclear;
    const scale = (v: number | null): number | null => (v === null ? null : r2(v * factor));

    let discountLines = 0;
    for (const p of priced) {
        const name = str(p.line.name) ?? '';
        if (p.line.kind === 'discount') {
            discountLines += scale(p.total) ?? 0;
        } else if (p.line.kind === 'labor') {
            const amount = scale(p.total);
            if (amount !== null && amount > 0) out.labor.push({ description: name, amount, source: doc.index });
        } else {
            out.parts.push({
                name,
                code: str(p.line.code),
                quantity: p.qty,
                unit_price: scale(p.unit),
                total: scale(p.total),
                source: doc.index,
                flaggedDup: p.line.duplicates_other_document === true,
            });
        }
    }
    // Itemised discount lines win over a document-level figure (avoids counting the same discount twice).
    const docDiscount = scale(num(doc.discount_total) !== null ? Math.abs(num(doc.discount_total)!) : null) ?? 0;
    out.discount = discountLines > 0 ? discountLines : docDiscount;
    return out;
}

function partKey(p: { name: string; code: string | null }): string {
    return p.code ? `c:${normKey(p.code)}` : `n:${normKey(p.name)}`;
}

/** Builds the final, ready-to-fill result from the model's raw per-document extraction. Pure: all math happens here. */
export function reconcileInvoiceExtraction(raw: RawInvoiceExtraction, opts: ReconcileOptions): InvoiceExtractionResult {
    const warnings: InvoiceWarning[] = [];
    const rawDocs = new Map<number, RawInvoiceDocument>();
    for (const d of raw.documents ?? []) {
        if (d && Number.isInteger(d.index) && d.index >= 0 && d.index < opts.fileCount && !rawDocs.has(d.index)) rawDocs.set(d.index, d);
    }
    const docs: ProcessedDoc[] = [];
    for (let i = 0; i < opts.fileCount; i++) {
        docs.push(processDoc(rawDocs.get(i) ?? { index: i, kind: 'unreadable', lines: [] }));
    }

    let merged = 0;

    // 1. Same document uploaded twice: identical number + total (or, without a number, identical supplier + date + total).
    const seenDocs = new Set<string>();
    for (const d of docs) {
        if (d.kind === 'unreadable' || d.grandTotal === null) continue;
        const id = str(d.raw.number)
            ? `n:${normKey(str(d.raw.number)!)}|${d.grandTotal}`
            : `s:${normKey(str(d.raw.supplier_name) ?? '')}|${normDate(d.raw.date) ?? ''}|${d.grandTotal}`;
        if (id.startsWith('s:|') ) continue; // nothing to identify it by
        if (seenDocs.has(id)) {
            d.duplicateOfDoc = true;
            merged++;
        } else seenDocs.add(id);
    }
    const active = docs.filter((d) => !d.duplicateOfDoc && d.kind !== 'unreadable');

    // 2. Currency: majority currency; if documents disagree, convert to RON when every foreign doc has a rate.
    const cur = (d: ProcessedDoc): InvoiceCurrency | null => d.currency;
    const counts = new Map<InvoiceCurrency, number>();
    for (const d of active) if (cur(d)) counts.set(cur(d)!, (counts.get(cur(d)!) ?? 0) + 1);
    const present = [...counts.keys()];
    let currency: InvoiceCurrency = present.length
        ? [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] === 'RON' ? -1 : 1))[0][0]
        : 'RON';
    const rateFor = new Map<number, number>();
    if (present.length > 1) {
        const foreign = active.filter((d) => cur(d) && cur(d) !== 'RON');
        const canConvert = foreign.every((d) => (opts.ronRates?.[d.raw.index] ?? 0) > 0);
        if (canConvert) {
            currency = 'RON';
            for (const d of foreign) rateFor.set(d.raw.index, opts.ronRates![d.raw.index]!);
        }
        warnings.push({
            code: 'MIXED_CURRENCY',
            params: { currencies: present.join(','), converted: canConvert ? 1 : 0, currency },
        });
    }
    const conv = (d: ProcessedDoc, v: number | null): number | null => {
        const rate = rateFor.get(d.raw.index);
        return v === null || !rate ? v : r2(v * rate);
    };

    // 3. Merge parts duplicated across documents. Priced occurrences win; ties go to parts invoices / receipts.
    type Cand = InvoicePart & { flaggedDup: boolean; docKind: InvoiceDocumentKind };
    const all: Cand[] = [];
    for (const d of active) {
        for (const p of d.parts) {
            all.push({
                ...p,
                unit_price: conv(d, p.unit_price),
                total: conv(d, p.total),
                docKind: d.kind,
            });
        }
    }
    const rank = (c: Cand): number => (c.total && c.total > 0 ? 2 : 0) + (c.docKind !== 'service_report' ? 1 : 0);
    const groups = new Map<string, Cand[]>();
    for (const c of all) {
        const k = partKey(c);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(c);
    }
    // A code on one document and none on the other: also try matching by name.
    const byName = new Map<string, string>();
    for (const [k, g] of groups) for (const c of g) if (!byName.has(`n:${normKey(c.name)}`)) byName.set(`n:${normKey(c.name)}`, k);
    for (const [k, g] of [...groups]) {
        if (!k.startsWith('n:')) continue;
        const target = byName.get(k);
        if (target && target !== k && groups.has(target)) {
            groups.get(target)!.push(...g);
            groups.delete(k);
        }
    }
    const keptParts: Cand[] = [];
    for (const g of groups.values()) {
        const docsInGroup = new Set(g.map((c) => c.source));
        if (docsInGroup.size < 2) {
            // Not on two documents: keep everything, except unpriced lines the model flagged as repeats of an unmatched part.
            for (const c of g) {
                if (c.flaggedDup && !(c.total && c.total > 0)) merged++;
                else keptParts.push(c);
            }
            continue;
        }
        // On several documents: keep one occurrence per quantity-bearing source, i.e. the best-ranked document's lines only.
        const best = [...g].sort((a, b) => rank(b) - rank(a))[0];
        const bestLines = g.filter((c) => c.source === best.source);
        keptParts.push(...bestLines);
        merged += g.length - bestLines.length;
    }
    keptParts.sort((a, b) => a.source - b.source || all.indexOf(a) - all.indexOf(b));

    const parts: InvoicePart[] = keptParts.map(({ flaggedDup: _f, docKind: _k, ...p }) => p);
    const labor: InvoiceLabor[] = active.flatMap((d) => d.labor.map((l) => ({ ...l, amount: conv(d, l.amount)! })));
    const discount = r2(active.reduce((s, d) => s + (conv(d, d.discount) ?? 0), 0));

    // 4. Totals.
    const partsSum = r2(parts.reduce((s, p) => s + (p.total ?? 0), 0));
    const laborSum = r2(labor.reduce((s, l) => s + l.amount, 0));
    const other = 0;
    const grand = r2(partsSum + laborSum + other - discount);
    const docTotals = active.map((d) => conv(d, d.grandTotal)).filter((v): v is number => v !== null);
    const documentsTotal = docTotals.length ? r2(docTotals.reduce((s, v) => s + v, 0)) : null;

    if (merged > 0) warnings.push({ code: 'DUPLICATES_MERGED', params: { count: merged } });
    const missing = parts.filter((p) => p.total === null).length;
    if (missing > 0) warnings.push({ code: 'MISSING_PRICES', params: { count: missing } });
    if (active.some((d) => d.vatUnclear)) warnings.push({ code: 'VAT_UNCLEAR' });
    for (const d of docs) if (d.kind === 'unreadable') warnings.push({ code: 'UNREADABLE_DOCUMENT', params: { index: d.raw.index } });
    if (documentsTotal !== null && Math.abs(grand - documentsTotal) > Math.max(1, 0.01 * documentsTotal)) {
        warnings.push({ code: 'TOTAL_MISMATCH', params: { computed: grand, documents: documentsTotal } });
    }

    // 5. Header fields.
    const summaries: InvoiceDocumentSummary[] = docs.map((d) => ({
        index: d.raw.index,
        kind: d.kind,
        supplier_name: str(d.raw.supplier_name),
        number: str(d.raw.number),
        date: normDate(d.raw.date),
        total: d.grandTotal,
        currency: d.currency,
    }));
    const dates = active.map((d) => normDate(d.raw.date)).filter((v): v is string => !!v).sort();
    const supplierDoc = active.find((d) => d.kind === 'service_report' && str(d.raw.supplier_name)) ?? active.find((d) => str(d.raw.supplier_name));
    const hasContent = parts.length > 0 || labor.length > 0 || grand > 0;
    const type = (INVOICE_SERVICE_TYPES as readonly string[]).includes(raw.service_type ?? '') ? (raw.service_type as InvoiceExtractionResult['service_type']) : null;
    const category = (INVOICE_SERVICE_CATEGORIES as readonly string[]).includes(raw.service_category ?? '') ? (raw.service_category as InvoiceExtractionResult['service_category']) : null;
    const detected = raw.detected !== false && hasContent;
    const title = str(raw.title);
    const mileage = num(raw.mileage);

    return {
        detected,
        service_type: detected ? type ?? 'MAINTENANCE' : null,
        service_category: detected ? category : null,
        plan_items: detected ? validPlanItems(raw.plan_items) : [],
        custom_items: detected ? sanitizeCustomItems(raw.custom_items, 5, 40) : [],
        title: title ? title.slice(0, 80) : null,
        notes: str(raw.notes),
        service_date: dates.length ? dates[dates.length - 1] : null,
        mileage: mileage !== null && mileage > 0 ? Math.round(mileage) : null,
        supplier_name: supplierDoc ? str(supplierDoc.raw.supplier_name) : null,
        currency,
        parts,
        labor,
        totals: { parts: partsSum, labor: laborSum, other, discount, grand_total: grand, documents_total: documentsTotal },
        documents: summaries,
        warnings,
    };
}

/** Keeps only valid, unique PlanItemKey values. Applicability to the car is filtered by the service. */
function validPlanItems(items: string[] | null | undefined): PlanItemKey[] {
    const valid = new Set<string>(Object.values(PlanItemKey));
    return [...new Set((items ?? []).filter((i) => valid.has(i)))] as PlanItemKey[];
}
