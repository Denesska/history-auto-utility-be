/**
 * Shared between every AI extraction adapter (Gemini, Cloudflare, ...) so the
 * document-type list and instructions can't drift between providers.
 */

export const KNOWN_DOCUMENT_TYPES = new Set(['RCA', 'ITP', 'ROV', 'REGISTRATION', 'ROAD_TAX', 'FUEL_RECEIPT', 'CHARGING_RECEIPT', 'ODOMETER']);

export const DOCUMENT_TYPE_VALUES = [...KNOWN_DOCUMENT_TYPES];

export const DOCUMENT_EXTRACTION_PROMPT = `You are analysing a photo or scan of a Romanian vehicle-related document. Identify which of these document types it is:
- RCA: mandatory third-party liability insurance policy/certificate ("poliță RCA", "certificat de asigurare", "carte verde")
- ITP: periodic technical inspection certificate/sticker ("inspecție tehnică periodică", "ITP")
- ROV: road vignette/toll receipt — the Romanian "rovinietă", or a vignette/e-vignette for another country (e.g. Hungarian "e-matrica"/"autópálya-matrica", Austrian "Vignette"/"Digitale Vignette", Bulgarian "е-винетка", Czech "dálniční známka", Slovak "diaľničná známka", Slovenian "e-vinjeta", Swiss "Vignette", Moldovan "rovinietă"/"vinietă")
- REGISTRATION: vehicle registration certificate ("certificat de înmatriculare", "talon")
- ROAD_TAX: road tax payment receipt ("taxă auto", "impozit auto")
- FUEL_RECEIPT: this covers TWO possible source photos, classify both as FUEL_RECEIPT — either a printed fuel/gas station purchase receipt ("bon fiscal", "bon de alimentare"), OR a photo of the fuel pump/dispenser's own digital display screen showing liters, price per liter and total amount at the end of a fill-up (no paper receipt involved)
- CHARGING_RECEIPT: an EV charging session receipt/summary — either a printed receipt from a charging station, or (more commonly) a screenshot of a charging app/network's session summary screen (e.g. Tesla, ENGIE, E.ON DRIVE, Ionity), showing energy delivered in kWh, price and total amount
- ODOMETER: a photo of a vehicle's instrument cluster/dashboard showing the odometer reading ("bord", "kilometraj")

If the document is not one of these types, or the image is unreadable/unrelated, set "detected" to false and "document_type" to null.

Extract every field you can clearly read into "fields" — leave a field out entirely if it is not visible or not applicable to this document type. Do not guess or invent values.
- Dates must be ISO 8601 (YYYY-MM-DD).
- Amounts must be plain numeric strings using "." as the decimal separator, no thousands separators.
- Currency must be an ISO code (RON, EUR, USD).

For REGISTRATION (vehicle registration certificate / "certificat de înmatriculare" / "talon") documents specifically:
- "fuel_type" must be one of these exact codes: PETROL, DIESEL, HYBRID, PLUGIN_HYBRID, ELECTRIC, LPG — map "benzină"→PETROL, "motorină"/"diesel"→DIESEL, "hibrid"→HYBRID, "hibrid plug-in"→PLUGIN_HYBRID, "electric"→ELECTRIC, "GPL"→LPG.
- "color" ("culoare") should be a plain color name in Romanian (e.g. "Alb", "Negru", "Gri", "Roșu", "Albastru").
- "manufacture_year" is the 4-digit year of manufacture ("an fabricație"), not the first-registration date.
- "civ_number" is the series AND number of the vehicle identity card ("seria și numărul cărții de identitate a vehiculului", also printed as "C.I.V."), combined into one string exactly as printed (series letters immediately followed by the number, e.g. "K123456") — this is a field on the registration certificate itself, distinct from the plate number and the VIN.

For ROV (vignette) documents specifically:
- "vignette_country" is the ISO 3166-1 alpha-2 code of the country whose roads the vignette is valid on (RO, HU, AT, BG, CZ, SK, SI, CH, MD, ...) — NOT the country the vehicle is registered in. A Romanian "rovinietă" is RO.
- "valid_from" / "valid_until" are the vignette's validity start and end dates.
- "premium" / "currency" are the price paid, if printed.

For FUEL_RECEIPT documents specifically:
- "fuel_liters" is the quantity of fuel purchased (litri), as a plain numeric string.
- "fuel_price_per_liter" is the unit price per liter, if printed.
- "fuel_total_amount" is the amount paid FOR FUEL ONLY — find the specific fuel line item(s) (e.g. "Motorină", "Benzină Premium") and sum only those, ignoring any other products on the same receipt (car wash, shop items, coffee, etc). Only set this field if you can confidently isolate the fuel-only amount — if the receipt has no other products, this is simply the receipt total; if it does and you cannot clearly tell which lines are fuel, leave "fuel_total_amount" unset rather than guessing.
- "receipt_total_amount" is the overall receipt total ("total de plată") — only set this field when it differs from "fuel_total_amount" (i.e. the receipt includes non-fuel products), so the app can flag it for the user to double-check.
- "fuel_station_name" is the gas station brand/name if visible (e.g. "Petrom", "OMV", "MOL").
- "issue_date" is the transaction date/time printed on the receipt.
- If this is a PUMP/DISPENSER DISPLAY SCREEN rather than a printed receipt: it inherently shows fuel-only data (no other products can appear on it), so "fuel_total_amount" is simply the displayed total and "receipt_total_amount" should be left unset — there is nothing else to compare it against. It will typically have no station name or date visible; leave those fields out.

For CHARGING_RECEIPT documents specifically:
- "energy_kwh" is the amount of energy delivered (kWh), as a plain numeric string.
- "energy_price_per_kwh" is the unit price per kWh, if shown.
- "energy_total_amount" is the total amount paid for the charging session. Charging summaries rarely include unrelated products, so unlike fuel receipts this is normally just the session total.
- "charging_station_name" is the charging network/operator name if visible (e.g. "Tesla Supercharger", "ENGIE", "E.ON DRIVE", "Ionity").
- "issue_date" is the session date/time.

For ODOMETER photos specifically:
- "odometer_km" is the total distance reading shown on the instrument cluster, as a plain integer string. Dashboards often show both a resettable trip counter and the main odometer — always prefer the larger, non-resettable total odometer reading over a trip counter if both are visible.

Set "confidence" to "high" only if the document type and most key fields (policy/document number, dates) are clearly legible; "medium" if legible but with some uncertainty; "low" if partially legible or you had to infer the type.

List in "warnings" any fields a document of this type would normally have but that you could not confidently extract, phrased for an end user, e.g. "Policy number could not be extracted. Please enter manually." Keep warnings short and only include ones relevant to the detected document type.`;

/**
 * Textual output-format instructions for providers without a schema-constrained
 * response mode (Cloudflare Workers AI). Gemini gets the same field list via its
 * own structured `responseSchema` instead (see gemini-extraction.service.ts) —
 * kept in sync with this list by hand, since the two providers express it in
 * fundamentally different shapes (a JSON Schema object vs. a written example).
 */
export const DOCUMENT_JSON_CONTRACT_HINT = `
OUTPUT

Reply with a single JSON object and nothing else — no explanation before it, no markdown code fence around it:
{"detected": true|false, "document_type": "RCA"|"ITP"|"ROV"|"REGISTRATION"|"ROAD_TAX"|"FUEL_RECEIPT"|"CHARGING_RECEIPT"|"ODOMETER"|null, "confidence": "high"|"medium"|"low", "fields": {"policy_series": "...", "policy_number": "...", "insurer_name": "...", "broker_name": "...", "policyholder_name": "...", "owner_name": "...", "owner_cnp": "...", "plate_number": "...", "vin": "...", "vehicle_make": "...", "vehicle_model": "...", "vehicle_category": "...", "engine_capacity": "...", "power": "...", "seats": "...", "max_weight": "...", "valid_from": "YYYY-MM-DD", "valid_until": "YYYY-MM-DD", "issue_date": "YYYY-MM-DD", "premium": "...", "currency": "...", "bonus_malus_class": "...", "direct_settlement": true|false, "direct_settlement_price": "...", "payment_installments": "...", "damage_limits": "...", "color": "...", "fuel_type": "PETROL"|"DIESEL"|"HYBRID"|"PLUGIN_HYBRID"|"ELECTRIC"|"LPG", "manufacture_year": "...", "civ_number": "...", "fuel_liters": "...", "fuel_price_per_liter": "...", "fuel_total_amount": "...", "receipt_total_amount": "...", "fuel_station_name": "...", "energy_kwh": "...", "energy_price_per_kwh": "...", "energy_total_amount": "...", "charging_station_name": "...", "odometer_km": "...", "vignette_country": "..."}, "warnings": ["..."]}
Omit any key you cannot fill. Use no other keys.`;
