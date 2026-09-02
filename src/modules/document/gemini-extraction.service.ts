import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import { ParseResult } from './parsers/document-parser.interface';

const KNOWN_DOCUMENT_TYPES = new Set(['RCA', 'ITP', 'ROV', 'REGISTRATION', 'ROAD_TAX']);

const PROMPT = `You are analysing a photo or scan of a Romanian vehicle-related document. Identify which of these document types it is:
- RCA: mandatory third-party liability insurance policy/certificate ("poliță RCA", "certificat de asigurare", "carte verde")
- ITP: periodic technical inspection certificate/sticker ("inspecție tehnică periodică", "ITP")
- ROV: road vignette/toll receipt ("rovinietă")
- REGISTRATION: vehicle registration certificate ("certificat de înmatriculare", "talon")
- ROAD_TAX: road tax payment receipt ("taxă auto", "impozit auto")

If the document is not one of these types, or the image is unreadable/unrelated, set "detected" to false and "document_type" to null.

Extract every field you can clearly read into "fields" — leave a field out entirely if it is not visible or not applicable to this document type. Do not guess or invent values.
- Dates must be ISO 8601 (YYYY-MM-DD).
- Amounts must be plain numeric strings using "." as the decimal separator, no thousands separators.
- Currency must be an ISO code (RON, EUR, USD).

For REGISTRATION (vehicle registration certificate / "certificat de înmatriculare" / "talon") documents specifically:
- "fuel_type" must be one of these exact codes: PETROL, DIESEL, HYBRID, PLUGIN_HYBRID, ELECTRIC, LPG — map "benzină"→PETROL, "motorină"/"diesel"→DIESEL, "hibrid"→HYBRID, "hibrid plug-in"→PLUGIN_HYBRID, "electric"→ELECTRIC, "GPL"→LPG.
- "color" ("culoare") should be a plain color name in Romanian (e.g. "Alb", "Negru", "Gri", "Roșu", "Albastru").
- "manufacture_year" is the 4-digit year of manufacture ("an fabricație"), not the first-registration date.

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
    },
};

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        detected: { type: Type.BOOLEAN },
        document_type: {
            type: Type.STRING,
            enum: ['RCA', 'ITP', 'ROV', 'REGISTRATION', 'ROAD_TAX'],
            nullable: true,
        },
        confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
        fields: EXTRACTED_FIELDS_SCHEMA,
        warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['detected', 'confidence', 'fields', 'warnings'],
};

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
            this.logger.error(`Gemini extraction failed: ${err instanceof Error ? err.message : err}`);
            return null;
        }
    }
}
