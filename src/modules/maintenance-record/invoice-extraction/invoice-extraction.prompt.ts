export type InvoiceLang = 'ro' | 'en' | 'ru';

const LANG_NAMES: Record<InvoiceLang, string> = { ro: 'Romanian', en: 'English', ru: 'Russian' };

export interface InvoicePromptCar {
    make: string;
    model: string;
    year: number | null;
    fuel_type: string | null;
    mileage: number | null;
}

export function buildInvoicePrompt(lang: InvoiceLang, fileCount: number, car: InvoicePromptCar | null): string {
    const carLine = car
        ? `Vehicle context: ${car.make} ${car.model}${car.year ? ` (${car.year})` : ''}${car.fuel_type ? `, fuel ${car.fuel_type}` : ''}${car.mileage != null ? `, last known mileage ${car.mileage} km` : ''}.`
        : 'No vehicle context was provided.';

    return `You extract data from ${fileCount} attached file(s) (photos or PDFs, in the order given, 0-based index) that all belong to ONE vehicle maintenance/repair intervention. Documents are mostly Romanian (also Moldovan/Russian, sometimes English): facturi, bonuri fiscale, devize / fise de lucru / comenzi de lucru from a service workshop, parts invoices from a shop.
${carLine}
Today is ${new Date().toISOString().slice(0, 10)}.

Rules:
- Return one entry in "documents" for EVERY attached file, with its index. kind: "parts_invoice" (invoice/receipt for parts from a seller), "service_report" (workshop work order / devize / service report, usually lists work done and often also parts), "receipt" (fiscal receipt), "other", or "unreadable" (blurry/blank/not a relevant document; then leave lines empty).
- Extract EVERY line item, exactly as printed: name, product code if any, quantity, unit price, line total. NEVER invent or estimate prices; use null when a value is not printed. Do not compute totals yourself, copy only what is printed.
- Line kind: "part" for physical parts/materials/fluids; "labor" for manopera / labor / работа / ore / montaj / diagnoza / diagnosis fees; "discount" for discount lines (put the amount as a POSITIVE number in line_total); "other_charge" for named extra charges (consumabile, taxa de mediu, transport).
- prices_basis: "gross" if line prices include VAT (TVA inclus), "net" if line prices are without VAT and VAT is added at the bottom, "unknown" if you cannot tell. Also give vat_rate (percent), vat_amount, net_total (total fara TVA) and grand_total (the printed total to pay, VAT included) when printed. discount_total only for a document-level discount that is not an itemised line.
- Also extract supplier_name (the issuer), number (invoice / order number), date (YYYY-MM-DD) and currency (RON, EUR, USD or MDL) of each document.
- Service reports frequently repeat parts that are also on the parts invoice (sometimes with price 0 or no price). Set duplicates_other_document=true on such lines that repeat a part already present on ANOTHER attached document. Keep the line anyway.
- mileage: odometer km from a service report if present, else null.
- service_type: "MAINTENANCE" for periodic/scheduled service (oil + filters, inspection), "REPAIR" when fixing a fault or broken part, "IMPROVEMENT" for upgrades/accessories, "PASSION" for cosmetic/hobby work. service_category: the dominant category of the intervention (a periodic oil + filters service is OIL_CHANGE).
- title: short (max 80 chars) in ${LANG_NAMES[lang]}, neutral tone, naming what was done. notes: 2 to 6 short lines in ${LANG_NAMES[lang]}, plain text separated by newlines, no markdown or bullets, summarising work done, parts replaced and any recommendations found on the service report. Example style: "Schimb ulei 5W-30 (4,5 l), filtru ulei, filtru aer, filtru habitaclu, filtru combustibil." Part names in the "lines" array stay exactly as written on the document (do not translate).
- If nothing usable about a vehicle service/parts purchase is found, set detected=false.
- Numbers are plain JSON numbers with a dot as decimal separator (convert "1.234,50" to 1234.5).`;
}
