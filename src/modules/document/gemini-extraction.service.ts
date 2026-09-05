import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import { ParseResult } from './parsers/document-parser.interface';

const KNOWN_DOCUMENT_TYPES = new Set(['RCA', 'ITP', 'ROV', 'REGISTRATION', 'ROAD_TAX', 'FUEL_RECEIPT', 'CHARGING_RECEIPT', 'ODOMETER']);

const PROMPT = `You are analysing a photo or scan of a Romanian vehicle-related document. Identify which of these document types it is:
- RCA: mandatory third-party liability insurance policy/certificate ("poliță RCA", "certificat de asigurare", "carte verde")
- ITP: periodic technical inspection certificate/sticker ("inspecție tehnică periodică", "ITP")
- ROV: road vignette/toll receipt ("rovinietă")
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

const EXTRACTED_FIELDS_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        policy_series: { type: Type.STRING },
        policy_number: { type: Type.STRING },
        insurer_name: { type: Type.STRING },
        broker_name: { type: Type.STRING },
        policyholder_name: { type: Type.STRING },
        owner_name: { type: Type.STRING },
        owner_cnp: { type: Type.STRING },
        plate_number: { type: Type.STRING },
        vin: { type: Type.STRING },
        vehicle_make: { type: Type.STRING },
        vehicle_model: { type: Type.STRING },
        vehicle_category: { type: Type.STRING },
        engine_capacity: { type: Type.STRING },
        power: { type: Type.STRING },
        seats: { type: Type.STRING },
        max_weight: { type: Type.STRING },
        valid_from: { type: Type.STRING },
        valid_until: { type: Type.STRING },
        issue_date: { type: Type.STRING },
        premium: { type: Type.STRING },
        currency: { type: Type.STRING },
        bonus_malus_class: { type: Type.STRING },
        direct_settlement: { type: Type.BOOLEAN },
        direct_settlement_price: { type: Type.STRING },
        payment_installments: { type: Type.STRING },
        damage_limits: { type: Type.STRING },
        color: { type: Type.STRING },
        fuel_type: { type: Type.STRING },
        manufacture_year: { type: Type.STRING },
        fuel_liters: { type: Type.STRING },
        fuel_price_per_liter: { type: Type.STRING },
        fuel_total_amount: { type: Type.STRING },
        receipt_total_amount: { type: Type.STRING },
        fuel_station_name: { type: Type.STRING },
        energy_kwh: { type: Type.STRING },
        energy_price_per_kwh: { type: Type.STRING },
        energy_total_amount: { type: Type.STRING },
        charging_station_name: { type: Type.STRING },
        odometer_km: { type: Type.STRING },
    },
};

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        detected: { type: Type.BOOLEAN },
        document_type: {
            type: Type.STRING,
            enum: ['RCA', 'ITP', 'ROV', 'REGISTRATION', 'ROAD_TAX', 'FUEL_RECEIPT', 'CHARGING_RECEIPT', 'ODOMETER'],
            nullable: true,
        },
        confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
        fields: EXTRACTED_FIELDS_SCHEMA,
        warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['detected', 'confidence', 'fields', 'warnings'],
};

/**
 * Thrown when the Gemini API itself is unreachable/overloaded (e.g. HTTP 503 "UNAVAILABLE" —
 * high demand), as opposed to a document that simply isn't a recognisable type. Callers should
 * surface this distinctly to the user rather than treating it as "document not detected".
 */
export class GeminiServiceUnavailableError extends Error {
    constructor() {
        super('Gemini extraction service is temporarily unavailable.');
        this.name = 'GeminiServiceUnavailableError';
    }
}

/**
 * AI-based fallback extractor for document types/formats the regex parsers can't handle
 * (photos, scans, and any document type other than text-based RCA PDFs).
 *
 * Missing GEMINI_API_KEY is treated as "feature disabled" rather than a startup failure —
 * the dev checkout is shared with backend-test (see CLAUDE.md known issue), so a required
 * key here would risk crashing test/prod bootstrapping if the key isn't set in their env files.
 */
@Injectable()
export class GeminiExtractionService {
    private readonly logger = new Logger(GeminiExtractionService.name);
    private readonly client: GoogleGenAI | null;
    private readonly model: string;

    constructor(private readonly config: ConfigService) {
        const apiKey = this.config.get<string>('GEMINI_API_KEY');
        this.model = this.config.get<string>('GEMINI_MODEL') || 'gemini-3.6-flash';
        this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;

        if (!this.client) {
            this.logger.warn('GEMINI_API_KEY is not set — AI document extraction is disabled.');
        }
    }

    async extract(buffer: Buffer, mimeType: string): Promise<ParseResult | null> {
        if (!this.client) return null;

        try {
            const response = await this.client.models.generateContent({
                model: this.model,
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: PROMPT }, { inlineData: { mimeType, data: buffer.toString('base64') } }],
                    },
                ],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: RESPONSE_SCHEMA,
                    temperature: 0,
                    httpOptions: { timeout: 90_000 },
                },
            });

            const parsed = JSON.parse(response.text ?? '');
            if (!parsed?.detected || !KNOWN_DOCUMENT_TYPES.has(parsed.document_type)) {
                return null;
            }

            return {
                detected: true,
                document_type: parsed.document_type,
                confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
                fields: parsed.fields ?? {},
                warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Gemini extraction failed: ${message}`);
            if (this.isServiceUnavailable(err, message)) {
                throw new GeminiServiceUnavailableError();
            }
            return null;
        }
    }

    // Distinguishes a transient Gemini outage/overload (HTTP 503 "UNAVAILABLE") from any other
    // extraction failure — the SDK error shape isn't strongly typed, so check status/code fields
    // first and fall back to sniffing the (often JSON-stringified) message.
    private isServiceUnavailable(err: unknown, message: string): boolean {
        const status = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
        if (status === 503) return true;
        return /"code"\s*:\s*503/.test(message) || /UNAVAILABLE/.test(message);
    }
}
