import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import { ServiceCategory } from '../document/enum/service-category.enum';

const CATEGORY_VALUES = Object.values(ServiceCategory).filter(
    (value) => value !== ServiceCategory.COMBUSTIBIL && value !== ServiceCategory.OTHER,
);

const PROMPT = `You are classifying a Romanian vehicle maintenance/repair record into exactly one category, based on its title and any part names listed. Categories:
- OIL_CHANGE: engine oil and oil filter ("ulei motor", "vidanjă", "filtru ulei")
- BRAKE_SERVICE: brakes ("plăcuțe frână", "disc frână", "etrier", "lichid de frână")
- TRANSMISSION_SERVICE: gearbox/clutch/differential ("cutie de viteze", "ambreiaj", "ulei transmisie")
- TIRE_SERVICE: tires/wheels ("anvelope", "cauciucuri", "vulcanizare", "jantă")
- FLUID_SERVICE: coolant/other fluids other than oil/brake fluid ("antigel", "lichid parbriz", "lichid servodirecție")
- ENGINE_SERVICE: general engine repair not covered above ("curea distribuție", "bujii", "injector", "turbină")
- INSPECTION: periodic inspection/ITP/general check-up ("ITP", "inspecție", "revizie")
- BATTERY_SERVICE: battery ("baterie auto", "acumulator")
- FILTER_SERVICE: air/cabin/fuel filters (not oil filter — that's OIL_CHANGE) ("filtru aer", "filtru polen", "filtru combustibil")
- LIGHT_SERVICE: lighting ("bec far", "far", "stop", "lampă")

If nothing matches confidently, set "category" to null and "confidence" to "low". Never guess a category just because you're unsure — use null instead so the caller knows no suggestion could be made.`;

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        category: { type: Type.STRING, enum: CATEGORY_VALUES, nullable: true },
        confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
    },
    required: ['confidence'],
};

/**
 * Thrown when the Gemini API itself is unreachable/overloaded (e.g. HTTP 503 "UNAVAILABLE"),
 * as opposed to simply not being confident enough to suggest a category.
 */
export class CategorySuggestionServiceUnavailableError extends Error {
    constructor() {
        super('Category suggestion service is temporarily unavailable.');
        this.name = 'CategorySuggestionServiceUnavailableError';
    }
}

export interface CategorySuggestion {
    category: ServiceCategory | null;
    confidence: 'high' | 'medium' | 'low';
}

/**
 * AI-based fallback for suggesting a maintenance record's service_category from free text
 * (description + part names), used only when the frontend's local keyword heuristic can't
 * confidently classify the record itself.
 *
 * Missing GEMINI_API_KEY is treated as "feature disabled" rather than a startup failure —
 * the dev checkout is shared with backend-test (see CLAUDE.md known issue), so a required
 * key here would risk crashing test/prod bootstrapping if the key isn't set in their env files.
 */
@Injectable()
export class CategorySuggestionService {
    private readonly logger = new Logger(CategorySuggestionService.name);
    private readonly client: GoogleGenAI | null;
    private readonly model: string;

    constructor(private readonly config: ConfigService) {
        const apiKey = this.config.get<string>('GEMINI_API_KEY');
        this.model = this.config.get<string>('GEMINI_MODEL') || 'gemini-3.6-flash';
        this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;

        if (!this.client) {
            this.logger.warn('GEMINI_API_KEY is not set — AI category suggestion is disabled.');
        }
    }

    async suggest(description: string, partNames: string[]): Promise<CategorySuggestion | null> {
        if (!this.client) return null;
        if (!description?.trim() && !partNames.length) return null;

        try {
            const response = await this.client.models.generateContent({
                model: this.model,
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                text: `${PROMPT}\n\nTitle: ${description || '(none)'}\nParts: ${partNames.length ? partNames.join(', ') : '(none)'}`,
                            },
                        ],
                    },
                ],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: RESPONSE_SCHEMA,
                    temperature: 0,
                    httpOptions: { timeout: 30_000 },
                },
            });

            const parsed = JSON.parse(response.text ?? '');
            const category = CATEGORY_VALUES.includes(parsed?.category) ? (parsed.category as ServiceCategory) : null;
            const confidence = ['high', 'medium', 'low'].includes(parsed?.confidence) ? parsed.confidence : 'low';
            return { category, confidence };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Category suggestion failed: ${message}`);
            if (this.isServiceUnavailable(err, message)) {
                throw new CategorySuggestionServiceUnavailableError();
            }
            return null;
        }
    }

    // Distinguishes a transient Gemini outage/overload (HTTP 503 "UNAVAILABLE") from any other
    // failure — the SDK error shape isn't strongly typed, so check status/code fields first and
    // fall back to sniffing the (often JSON-stringified) message.
    private isServiceUnavailable(err: unknown, message: string): boolean {
        const status = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
        if (status === 503) return true;
        return /"code"\s*:\s*503/.test(message) || /UNAVAILABLE/.test(message);
    }
}
