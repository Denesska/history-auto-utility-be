import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import { ParseResult } from './parsers/document-parser.interface';
import { DOCUMENT_EXTRACTION_PROMPT, DOCUMENT_TYPE_VALUES, KNOWN_DOCUMENT_TYPES } from './document-extraction.prompt';

const PROMPT = DOCUMENT_EXTRACTION_PROMPT;

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
        civ_number: { type: Type.STRING },
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
        vignette_country: { type: Type.STRING },
    },
};

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        detected: { type: Type.BOOLEAN },
        document_type: {
            type: Type.STRING,
            enum: DOCUMENT_TYPE_VALUES,
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
