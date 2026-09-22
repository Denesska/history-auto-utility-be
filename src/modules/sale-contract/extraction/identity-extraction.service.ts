import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractAddress, ExtractionConfidence, IdentityDocumentFields, IdentityExtractionProvider, IdentityExtractionResult, IdentityExtractionUnavailableError } from '../sale-contract.types';
import { ClaudeIdentityProvider } from './claude-identity.provider';
import { CloudflareIdentityProvider } from './cloudflare-identity.provider';
import { describeCnpProblem, isValidCnp } from '../../../common/crypto/cnp.util';
import { redactText } from '../../../common/crypto/redact.util';

const CNP_FALLBACK_WARNING = 'CNP-ul citit pare gresit. Verifica-l cifra cu cifra inainte de a continua.';

/**
 * The facade the rest of the app calls to read a Romanian identity card.
 *
 * Two things live here rather than in the adapters:
 *
 * 1. Provider selection. IDENTITY_EXTRACTION_PROVIDER picks between the paid
 *    vendors (`claude`, `cloudflare`) so they can be A/B tested on real photos
 *    without a redeploy. Identity documents never go through the Gemini free
 *    tier the rest of the app uses — its terms allow the provider to train on
 *    submitted data, which is unacceptable for an ID card.
 *
 * 2. Post-processing that must be identical whichever vendor ran: CNP checksum
 *    validation, and normalising the values into the shapes the contract PDF
 *    expects.
 *
 * No extracted value is ever logged — not at debug level, not inside an error
 * message, not in a thrown error's payload. Only the provider name, timings,
 * error categories and counts. The image buffer stays in memory for the
 * duration of the call and is never written to disk or object storage.
 */
@Injectable()
export class IdentityExtractionService {
    private readonly logger = new Logger(IdentityExtractionService.name);
    private readonly provider: IdentityExtractionProvider | null;

    constructor(
        private readonly config: ConfigService,
        private readonly claude: ClaudeIdentityProvider,
        private readonly cloudflare: CloudflareIdentityProvider,
    ) {
        this.provider = this.selectProvider();
    }

    /** Which provider will run, or null when none is configured. For diagnostics. */
    get activeProvider(): string | null {
        return this.provider?.name ?? null;
    }

    isEnabled(): boolean {
        return this.provider !== null;
    }

    async extract(image: Buffer, mimeType: string): Promise<IdentityExtractionResult | null> {
        if (!this.provider) {
            this.logger.warn('Identity extraction is disabled — no provider is configured.');
            return null;
        }

        const startedAt = Date.now();
        let result: IdentityExtractionResult | null;

        try {
            result = await this.provider.extract(image, mimeType);
        } catch (err) {
            const elapsed = Date.now() - startedAt;
            if (err instanceof IdentityExtractionUnavailableError) {
                this.logger.error(`[${this.provider.name}] unavailable after ${elapsed}ms.`);
                throw err;
            }
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`[${this.provider.name}] extraction threw after ${elapsed}ms: ${redactText(message)}`);
            return null;
        }

        const elapsed = Date.now() - startedAt;
        if (!result) {
            this.logger.warn(`[${this.provider.name}] returned no result after ${elapsed}ms.`);
            return null;
        }

        const processed = this.postProcess(result);
        this.logger.log(`[${this.provider.name}] identity extraction done in ${elapsed}ms: detected=${processed.detected} confidence=${processed.confidence} fields=${Object.keys(processed.fields).length} warnings=${processed.warnings.length}`);
        return processed;
    }

    // -----------------------------------------------------------------------
    // Provider selection
    // -----------------------------------------------------------------------

    private selectProvider(): IdentityExtractionProvider | null {
        const providers: IdentityExtractionProvider[] = [this.claude, this.cloudflare];
        const requested = this.config.get<string>('IDENTITY_EXTRACTION_PROVIDER')?.trim().toLowerCase();

        if (requested) {
            const match = providers.find((p) => p.name === requested);
            if (!match) {
                this.logger.warn(`IDENTITY_EXTRACTION_PROVIDER="${requested}" is not a known provider (expected one of: ${providers.map((p) => p.name).join(', ')}). Falling back to whichever provider is configured.`);
            } else if (!match.isConfigured()) {
                this.logger.warn(`IDENTITY_EXTRACTION_PROVIDER="${requested}" is selected but its credentials are not set. Falling back to whichever provider is configured.`);
            } else {
                this.logger.log(`Identity extraction provider: ${match.name} (from IDENTITY_EXTRACTION_PROVIDER).`);
                return match;
            }
        }

        const configured = providers.filter((p) => p.isConfigured());
        if (configured.length === 0) {
            this.logger.warn('Identity extraction is disabled: no provider is configured. Set ANTHROPIC_API_KEY (claude) or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN (cloudflare), and optionally IDENTITY_EXTRACTION_PROVIDER to choose between them.');
            return null;
        }
        if (configured.length > 1) {
            this.logger.warn(`Several identity extraction providers are configured (${configured.map((p) => p.name).join(', ')}) and IDENTITY_EXTRACTION_PROVIDER does not select one. Using "${configured[0].name}".`);
        } else {
            this.logger.log(`Identity extraction provider: ${configured[0].name} (only configured provider).`);
        }
        return configured[0];
    }

    // -----------------------------------------------------------------------
    // Post-processing
    // -----------------------------------------------------------------------

    private postProcess(result: IdentityExtractionResult): IdentityExtractionResult {
        const warnings = [...result.warnings];
        let confidence: ExtractionConfidence = result.confidence;

        const fields: IdentityDocumentFields = { ...result.fields };
        if (fields.address) fields.address = this.normaliseAddress(fields.address);

        // Series is always uppercase on the card; the number and the CNP are
        // digits only. Models sometimes return "XH 123456" or "1950101 412348".
        if (fields.id_series) fields.id_series = fields.id_series.replace(/[^A-Za-z]/g, '').toUpperCase() || undefined;
        if (fields.id_number) fields.id_number = fields.id_number.replace(/\s/g, '') || undefined;
        if (fields.cnp) fields.cnp = fields.cnp.replace(/\s/g, '') || undefined;

        for (const key of ['issue_date', 'valid_until'] as const) {
            const raw = fields[key];
            if (!raw) continue;
            const iso = this.toIsoDate(raw);
            if (iso) {
                fields[key] = iso;
            } else {
                // Better an empty blank than a wrong date on a legal document.
                delete fields[key];
                warnings.push(key === 'issue_date' ? 'Data emiterii actului nu a putut fi interpretata. Completeaz-o manual.' : 'Data expirarii actului nu a putut fi interpretata. Completeaz-o manual.');
            }
        }

        const fullName = this.buildFullName(fields);
        if (fullName) fields.full_name = fullName;

        // CNP checksum. A single misread digit is both the likeliest and the most
        // damaging failure here, and the control digit catches most of them. Keep
        // the value — the user needs to see what was read so they can correct one
        // character — but drop confidence and tell them to check this field.
        if (fields.cnp && !isValidCnp(fields.cnp)) {
            confidence = 'low';
            warnings.push(describeCnpProblem(fields.cnp) ?? CNP_FALLBACK_WARNING);
        }

        return {
            detected: result.detected,
            confidence,
            fields,
            warnings: Array.from(new Set(warnings.filter(Boolean))),
            provider: result.provider,
        };
    }

    /** "Nume Prenume" — the order the ITL 054 form expects. */
    private buildFullName(fields: IdentityDocumentFields): string | undefined {
        const parts = [fields.last_name, fields.first_name].filter((p) => typeof p === 'string' && p.trim().length > 0).map((p) => p.trim());
        if (parts.length > 0) return parts.join(' ');
        return fields.full_name?.trim() || undefined;
    }

    private normaliseAddress(address: ContractAddress): ContractAddress {
        const out: ContractAddress = {};
        for (const [key, value] of Object.entries(address)) {
            if (typeof value !== 'string') continue;
            const trimmed = value.replace(/\s+/g, ' ').trim();
            if (trimmed) out[key] = trimmed;
        }
        return out;
    }

    /**
     * Accepts what a Romanian card actually prints (dd.mm.yyyy, dd.mm.yy,
     * dd/mm/yyyy, dd-mm-yyyy) plus the ISO the prompt asks for. Returns null for
     * anything it cannot resolve unambiguously — we never guess a date.
     */
    private toIsoDate(value: string): string | null {
        const text = value.trim();

        const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return this.buildIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

        const dmy = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2}|\d{4})$/);
        if (dmy) {
            const day = Number(dmy[1]);
            const month = Number(dmy[2]);
            let year = Number(dmy[3]);
            if (dmy[3].length === 2) {
                // An identity card's dates sit within a few years of today, so a
                // two-digit year is unambiguous in practice: anything more than a
                // decade ahead of now belongs to the previous century.
                const currentYear = new Date().getFullYear();
                const candidate = Math.floor(currentYear / 100) * 100 + year;
                year = candidate - currentYear > 15 ? candidate - 100 : candidate;
            }
            return this.buildIso(year, month, day);
        }

        return null;
    }

    private buildIso(year: number, month: number, day: number): string | null {
        if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
        if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
        return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
}
