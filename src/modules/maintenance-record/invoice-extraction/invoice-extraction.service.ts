import {
    BadRequestException, Injectable, Logger, ServiceUnavailableException, UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiUsageService } from '../../ai-usage/ai-usage.service';
import { CarAccessService } from '../../car-access/car-access.service';
import { ExchangeRateService } from '../../exchange-rate/exchange-rate.service';
import { getRequestSessionContext } from '../../../common/context/request-context';
import { GeminiServiceUnavailableError } from '../../document/gemini-extraction.service';
import { buildInvoicePrompt, InvoiceLang, InvoicePromptCar } from './invoice-extraction.prompt';
import { reconcileInvoiceExtraction } from './invoice-reconciliation';
import {
    INVOICE_DOCUMENT_KINDS, INVOICE_SERVICE_CATEGORIES, INVOICE_SERVICE_TYPES, InvoiceExtractionResult, RawInvoiceExtraction,
} from './invoice-extraction.types';

const SUPPORTED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const FEATURE = 'maintenance_invoice_extract' as const;
// Up to 3 documents with many line items; thinking tokens also count against this cap.
const MAX_OUTPUT_TOKENS = 16384;
const LANGS: InvoiceLang[] = ['ro', 'en', 'ru'];

const LINE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        kind: { type: Type.STRING, enum: ['part', 'labor', 'discount', 'other_charge'] },
        name: { type: Type.STRING },
        code: { type: Type.STRING, nullable: true },
        quantity: { type: Type.NUMBER, nullable: true },
        unit_price: { type: Type.NUMBER, nullable: true },
        line_total: { type: Type.NUMBER, nullable: true },
        duplicates_other_document: { type: Type.BOOLEAN },
    },
    required: ['kind', 'name'],
};

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        detected: { type: Type.BOOLEAN },
        service_type: { type: Type.STRING, enum: [...INVOICE_SERVICE_TYPES], nullable: true },
        service_category: { type: Type.STRING, enum: [...INVOICE_SERVICE_CATEGORIES], nullable: true },
        title: { type: Type.STRING, nullable: true },
        notes: { type: Type.STRING, nullable: true },
        mileage: { type: Type.NUMBER, nullable: true },
        documents: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    index: { type: Type.INTEGER },
                    kind: { type: Type.STRING, enum: [...INVOICE_DOCUMENT_KINDS] },
                    supplier_name: { type: Type.STRING, nullable: true },
                    number: { type: Type.STRING, nullable: true },
                    date: { type: Type.STRING, nullable: true },
                    currency: { type: Type.STRING, nullable: true },
                    prices_basis: { type: Type.STRING, enum: ['gross', 'net', 'unknown'] },
                    vat_rate: { type: Type.NUMBER, nullable: true },
                    vat_amount: { type: Type.NUMBER, nullable: true },
                    net_total: { type: Type.NUMBER, nullable: true },
                    grand_total: { type: Type.NUMBER, nullable: true },
                    discount_total: { type: Type.NUMBER, nullable: true },
                    lines: { type: Type.ARRAY, items: LINE_SCHEMA },
                },
                required: ['index', 'kind', 'lines'],
            },
        },
    },
    required: ['detected', 'documents'],
};

/**
 * Reads 1-3 photos/PDFs of invoices / service work orders for ONE maintenance intervention with
 * Gemini (raw per-document extraction only) and reconciles them in code into one ready-to-fill entry.
 * No Cloudflare fallback: it can't read PDFs or several documents at once.
 */
@Injectable()
export class InvoiceExtractionService {
    private readonly logger = new Logger(InvoiceExtractionService.name);
    private readonly client: GoogleGenAI | null;
    private readonly model: string;

    constructor(
        private readonly config: ConfigService,
        private readonly aiUsage: AiUsageService,
        private readonly carAccess: CarAccessService,
        private readonly prisma: PrismaService,
        private readonly exchangeRates: ExchangeRateService,
    ) {
        const apiKey = this.config.get<string>('GEMINI_API_KEY');
        this.model = this.config.get<string>('GEMINI_MODEL') || 'gemini-3.6-flash';
        this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
        if (!this.client) this.logger.warn('GEMINI_API_KEY is not set — AI invoice extraction is disabled.');
    }

    async extract(
        files: Express.Multer.File[],
        userId: number,
        opts: { carId?: number | null; lang?: string | null } = {},
    ): Promise<InvoiceExtractionResult> {
        if (!files?.length) throw new BadRequestException('No files uploaded. Attach 1 to 3 files with the field name "files".');
        if (files.length > 3) throw new BadRequestException('At most 3 files are allowed.');
        for (const f of files) {
            if (!SUPPORTED_MIME_TYPES.has(f.mimetype)) {
                throw new UnsupportedMediaTypeException(
                    `File type "${f.mimetype}" is not supported. Supported formats: PDF, JPEG, PNG, WEBP.`,
                );
            }
        }
        const lang = (opts.lang ?? 'ro') as InvoiceLang;
        if (!LANGS.includes(lang)) throw new BadRequestException('lang must be one of: ro, en, ru.');
        const carId = opts.carId ?? null;

        let car: InvoicePromptCar | null = null;
        if (carId !== null) {
            await this.carAccess.assertHasAccess(carId, userId);
            const row = await this.prisma.car.findUnique({
                where: { id: carId },
                select: { make: true, model: true, year: true, fuel_type: true, current_mileage: true, actual_mileage: true },
            });
            if (row) {
                car = {
                    make: row.make, model: row.model, year: row.year, fuel_type: row.fuel_type,
                    mileage: row.actual_mileage ?? row.current_mileage,
                };
            }
        }

        if (!this.client) {
            throw new ServiceUnavailableException('Invoice analysis is currently unavailable. Please fill in the entry manually.');
        }

        const ctx = getRequestSessionContext();
        const orgId = ctx?.type === 'business' ? ctx.orgId : null;
        // Order matters (it defines the document indexes), so file hashes are not sorted.
        const contentHash = this.aiUsage.hashBuffer(
            Buffer.from(`${files.map((f) => this.aiUsage.hashBuffer(f.buffer)).join('|')}#${lang}#${carId ?? ''}`),
        );
        const cached = await this.aiUsage.getCached<InvoiceExtractionResult>(userId, FEATURE, contentHash);
        if (cached) return cached;
        await this.aiUsage.assertQuota(FEATURE, userId, orgId);

        let raw: RawInvoiceExtraction;
        try {
            raw = await this.callGemini(files, lang, car, (r) => void this.aiUsage.record({ feature: FEATURE, userId, orgId, provider: 'gemini', ...r }));
        } catch (err) {
            if (err instanceof GeminiServiceUnavailableError) {
                throw new ServiceUnavailableException(
                    'The invoice analysis service is temporarily overloaded. Please try again in a few minutes, or fill in the entry manually.',
                );
            }
            throw err;
        }

        const ronRates = await this.loadRonRates(raw);
        const result = reconcileInvoiceExtraction(raw, { fileCount: files.length, ronRates });
        if (result.detected) await this.aiUsage.setCached(userId, FEATURE, contentHash, result);
        return result;
    }

    /** Only needed when documents disagree on currency: BNR rate at each foreign document's date. */
    private async loadRonRates(raw: RawInvoiceExtraction): Promise<Record<number, number | undefined>> {
        const docs = raw.documents ?? [];
        const currencies = new Set(docs.filter((d) => d.kind !== 'unreadable').map((d) => (d.currency ?? '').toUpperCase()).filter(Boolean));
        const rates: Record<number, number | undefined> = {};
        if (currencies.size < 2) return rates;
        for (const d of docs) {
            const code = (d.currency ?? '').toUpperCase();
            if (!code || code === 'RON') continue;
            const date = d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? new Date(`${d.date}T00:00:00Z`) : new Date();
            const bnr = await this.exchangeRates.getRonRate(code, date).catch(() => null);
            rates[d.index] = bnr?.rate;
        }
        return rates;
    }

    private async callGemini(
        files: Express.Multer.File[],
        lang: InvoiceLang,
        car: InvoicePromptCar | null,
        onUsage: (r: { model: string; inputTokens: number; outputTokens: number; status: 'ok' | 'error' }) => void,
    ): Promise<RawInvoiceExtraction> {
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
            { text: buildInvoicePrompt(lang, files.length, car) },
        ];
        files.forEach((f, i) => {
            parts.push({ text: `File index ${i}:` });
            parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString('base64') } });
        });

        let reported = false;
        try {
            const response = await this.client!.models.generateContent({
                model: this.model,
                contents: [{ role: 'user', parts }],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: RESPONSE_SCHEMA,
                    temperature: 0,
                    maxOutputTokens: MAX_OUTPUT_TOKENS,
                    httpOptions: { timeout: 90_000 },
                },
            });
            reported = true;
            const usage = response.usageMetadata;
            onUsage({
                model: this.model,
                inputTokens: usage?.promptTokenCount ?? 0,
                outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
                status: 'ok',
            });
            return JSON.parse(response.text ?? '') as RawInvoiceExtraction;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Gemini invoice extraction failed: ${message}`);
            if (!reported) onUsage({ model: this.model, inputTokens: 0, outputTokens: 0, status: 'error' });
            const status = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
            if (status === 503 || /"code"\s*:\s*503/.test(message) || /UNAVAILABLE/.test(message)) {
                throw new GeminiServiceUnavailableError();
            }
            throw new BadRequestException('The documents could not be analysed. Please try clearer photos or fill in the entry manually.');
        }
    }
}
