export type InvoiceLang = 'ro' | 'en' | 'ru';

const LANG_NAMES: Record<InvoiceLang, string> = { ro: 'Romanian', en: 'English', ru: 'Russian' };

/** Bump when the prompt changes in a way that should invalidate cached extraction results. */
export const INVOICE_PROMPT_VERSION = 'v3';

// Examples are given per target language so they do not bias the model toward Romanian.
const TITLE_EXAMPLES: Record<InvoiceLang, string[]> = {
    ro: ['Schimb ulei + filtre aer și habitaclu', 'Înlocuire plăcuțe frână față', 'Kit distribuție + pompă apă'],
    en: ['Oil change + air and cabin filters', 'Front brake pads replacement', 'Timing kit + water pump'],
    ru: ['Замена масла + воздушный и салонный фильтры', 'Замена передних тормозных колодок', 'Комплект ГРМ + водяной насос'],
};
const NOTES_EXAMPLES: Record<InvoiceLang, string> = {
    ro: 'Schimbat ulei motor 5W-30 (4,5 l) și filtrele de ulei, aer și habitaclu. Verificare generală.',
    en: 'Changed engine oil 5W-30 (4.5 l) and the oil, air and cabin filters. General check.',
    ru: 'Заменено моторное масло 5W-30 (4,5 л) и масляный, воздушный и салонный фильтры. Общая проверка.',
};

/** System instruction carrying the output-language rule (also repeated at the top of the prompt). */
export function buildInvoiceSystemInstruction(lang: InvoiceLang): string {
    return `You are an invoice data extractor. Write ALL free text you generate (title, notes and any other generated, non-copied text) in ${LANG_NAMES[lang]}, even when the documents are in another language. Only copy text verbatim from the documents where explicitly instructed (e.g. part names in "lines").`;
}

export interface InvoicePromptCar {
    make: string;
    model: string;
    year: number | null;
    fuel_type: string | null;
    mileage: number | null;
    transmission?: string | null;
    drivetrain?: string | null;
}

export function buildInvoicePrompt(lang: InvoiceLang, fileCount: number, car: InvoicePromptCar | null): string {
    const carLine = car
        ? `Vehicle context: ${car.make} ${car.model}${car.year ? ` (${car.year})` : ''}${car.fuel_type ? `, fuel ${car.fuel_type}` : ''}${car.transmission ? `, transmission ${car.transmission}` : ''}${car.drivetrain ? `, drivetrain ${car.drivetrain}` : ''}${car.mileage != null ? `, last known mileage ${car.mileage} km` : ''}.`
        : 'No vehicle context was provided.';

    const titleExamples = TITLE_EXAMPLES[lang].map((e) => `"${e}"`).join(', ');

    return `OUTPUT LANGUAGE RULE (most important): ALL free text you generate (title, notes and any other generated, non-copied text) MUST be written in ${LANG_NAMES[lang]}, even when the documents are in another language. Do not use any other language for it.

You extract data from ${fileCount} attached file(s) (photos or PDFs, in the order given, 0-based index) that all belong to ONE vehicle maintenance/repair intervention. Documents are mostly Romanian (also Moldovan/Russian, sometimes English): facturi, bonuri fiscale, devize / fise de lucru / comenzi de lucru from a service workshop, parts invoices from a shop.
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
- service_type: "MAINTENANCE" for periodic/scheduled service (engine oil and other fluids, filters, timing belt / distribution kit, ITP inspection), "REPAIR" when fixing or replacing something worn or broken (brake pads/discs, suspension, battery, lights, engine repair, fixing a fault), "IMPROVEMENT" for upgrades/accessories, "PASSION" for cosmetic/hobby work. service_category: the dominant category of the intervention (a periodic oil + filters service is OIL_CHANGE).
- plan_items: list EVERY maintenance Plan item that the document shows was actually done in this intervention, using ONLY these keys: ENGINE_OIL, AIR_FILTER, CABIN_FILTER, FUEL_FILTER, GEARBOX_OIL, DIFFERENTIAL_OIL, BRAKE_FLUID, COOLANT, POWER_STEERING_FLUID, AC_SERVICE, TIRES, INSPECTION, TIMING_BELT, BRAKE_PARTS, BATTERY, LIGHTS, SUSPENSION, ENGINE_REPAIR, BODYWORK, ELECTRICAL. Use [] when none apply. Only include an item when a line (part or labor) clearly shows it; never guess from the vehicle type. Mapping:
  - ENGINE_OIL: engine oil and/or oil filter (ulei motor, filtru ulei, schimb ulei, масло моторное, масляный фильтр). An oil change always includes the oil filter.
  - AIR_FILTER: engine air filter (filtru aer, filtru de aer motor, воздушный фильтр).
  - CABIN_FILTER: cabin / pollen filter (filtru polen, filtru habitaclu, filtru de cabina, салонный фильтр).
  - FUEL_FILTER: fuel / diesel filter (filtru motorina, filtru combustibil, filtru benzina, топливный фильтр).
  - GEARBOX_OIL: gearbox / ATF / DSG / CVT oil (ulei cutie, ulei cutie de viteze, ulei ATF, ulei DSG, масло КПП).
  - DIFFERENTIAL_OIL: differential / transfer case / axle oil (ulei diferential, ulei punte, ulei cutie de transfer, масло дифференциала).
  - BRAKE_FLUID: brake fluid, e.g. DOT 4 (lichid frana, lichid de frana, тормозная жидкость). Brake pads, discs and other brake parts are NOT BRAKE_FLUID (use BRAKE_PARTS).
  - COOLANT: coolant / antifreeze (antigel, lichid racire, lichid de racire, охлаждающая жидкость).
  - POWER_STEERING_FLUID: power steering fluid (ulei servodirectie, lichid servodirectie, жидкость ГУР).
  - AC_SERVICE: air conditioning recharge / freon / climate sanitising (incarcare freon, incarcare clima, igienizare clima, recarga AC, заправка кондиционера).
  - TIRES: NEW tyres fitted (anvelope noi, montaj anvelope noi). A seasonal swap of existing wheels, balancing, vulcanizare or repair is NOT TIRES.
  - INSPECTION: periodic technical inspection (ITP, inspectie tehnica periodica).
  - TIMING_BELT: timing belt / distribution kit (kit distributie, curea distributie, pompa de apa as part of a distribution kit, ремень ГРМ, комплект ГРМ). A timing chain replacement also counts.
  - BRAKE_PARTS: brake pads, discs, calipers (placute, placute frana, discuri, discuri frana, etriere, тормозные колодки, тормозные диски).
  - BATTERY: car battery (baterie, acumulator, аккумулятор).
  - LIGHTS: bulbs, headlights, tail lights (bec, becuri, far, stop, лампа, фара).
  - SUSPENSION: suspension / steering parts (amortizor, bieleta, pivot, bucse, cap de bara, амортизатор, шаровая опора).
  - ENGINE_REPAIR: engine repairs other than routine service, e.g. cylinder head gasket (garnitura chiulasa), injectors (injectoare), turbo. Timing belt / chain replacement is TIMING_BELT, not ENGINE_REPAIR.
  - BODYWORK: body, paint and glass work, dents, rust repair (tinichigerie, vopsitorie, vopsit, reparatie caroserie, parbriz, geam, luneta, rugina, кузовной ремонт, покраска, лобовое стекло, стекло).
  - ELECTRICAL: electrics / electronics, wiring, sensors, alternator, starter, ECU, electrical fault diagnostics (electrica, instalatie electrica, alternator, electromotor, senzor, calculator, ECU, diagnoza electrica, электрика, проводка, генератор, стартер, датчик, блок управления).
- custom_items: short labels, in ${LANG_NAMES[lang]}, for clearly identifiable work on the document that does NOT map to any plan_items key above (e.g. wiper blades replaced, exhaust repair). At most 5 items, each at most 40 characters, no prices or invoice numbers. Do not repeat work already covered by plan_items. Use [] when none.
- title: short human title, max 50 chars, in ${LANG_NAMES[lang]}, summarising what was done, e.g. ${titleExamples} (always in ${LANG_NAMES[lang]}). NO invoice numbers, supplier name or prices. notes: 1 to 2 plain sentences in ${LANG_NAMES[lang]}, no markdown or bullets, describing the work done in plain language and listing the main parts and operations, e.g. "${NOTES_EXAMPLES[lang]}" NO prices or totals (stored separately). Leave notes empty only if the documents give no information about the work. Part names in the "lines" array stay exactly as written on the document (do not translate).
- If nothing usable about a vehicle service/parts purchase is found, set detected=false.
- Numbers are plain JSON numbers with a dot as decimal separator (convert "1.234,50" to 1234.5).`;
}
