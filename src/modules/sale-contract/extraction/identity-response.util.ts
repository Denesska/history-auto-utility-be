import { ContractAddress, ExtractionConfidence, IdentityDocumentFields, IdentityExtractionResult } from '../sale-contract.types';

/**
 * Shared, provider-agnostic handling of whatever JSON an AI vendor hands back.
 *
 * Nothing in this file may log, and nothing may put an extracted value into a
 * message — these objects contain CNPs and home addresses.
 */

const CONFIDENCE_VALUES: ExtractionConfidence[] = ['high', 'medium', 'low'];

const ADDRESS_KEYS: (keyof ContractAddress)[] = [
    'country',
    'county',
    'postal_code',
    'city',
    'village_or_sector',
    'street',
    'street_number',
    'building',
    'staircase',
    'floor',
    'apartment',
];

const TEXT_KEYS: (keyof IdentityDocumentFields)[] = ['last_name', 'first_name', 'issued_by', 'nationality', 'place_of_birth'];

const DATE_KEYS: (keyof IdentityDocumentFields)[] = ['issue_date', 'valid_until'];

/** Values weak models like to emit instead of simply omitting a key. */
const PLACEHOLDERS = new Set(['', '-', '--', 'n/a', 'na', 'null', 'none', 'unknown', 'necunoscut', 'nespecificat', 'not visible', 'string', 'xxx', '...']);

const MAX_TEXT_LENGTH = 120;

export interface SanitizeOptions {
    /**
     * Strict mode additionally drops values that cannot possibly be right for
     * the field (a CNP that isn't 13 digits, a series that isn't two letters)
     * and records a Romanian warning for each drop.
     *
     * Used for open-weight models, which happily return "CNP: 1234" or echo the
     * schema's placeholder text. The paid, schema-constrained provider runs in
     * lenient mode: it only gets its whitespace trimmed, so that a genuinely
     * misread-but-well-formed CNP survives to the checksum check in the service
     * (which keeps it and warns, instead of silently dropping it).
     */
    strict: boolean;
}

export interface SanitizedPayload {
    detected: boolean;
    confidence: ExtractionConfidence;
    fields: IdentityDocumentFields;
    warnings: string[];
}

function asCleanString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (!trimmed || PLACEHOLDERS.has(trimmed.toLowerCase())) return undefined;
    return trimmed;
}

function asShortText(value: unknown): string | undefined {
    const cleaned = asCleanString(value);
    if (!cleaned) return undefined;
    return cleaned.length > MAX_TEXT_LENGTH ? undefined : cleaned;
}

/**
 * Pulls a JSON object out of a model response that may be wrapped in a markdown
 * fence, prefixed with prose ("Sure! Here is the JSON:"), or followed by a
 * closing remark. Returns null when nothing parseable can be recovered.
 */
export function salvageJsonObject(raw: string | undefined | null): Record<string, unknown> | null {
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (!text) return null;

    const candidates: string[] = [text];

    // ```json ... ``` / ``` ... ```
    const fenced = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if (fenced?.[1]) candidates.push(fenced[1].trim());

    // First balanced { ... } anywhere in the text, ignoring braces inside strings.
    const balanced = extractBalancedObject(text);
    if (balanced) candidates.push(balanced);

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            // try the next candidate
        }
    }
    return null;
}

function extractBalancedObject(text: string): string | null {
    const start = text.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return null;
}

/**
 * Turns an arbitrary parsed object into the envelope we promise callers,
 * dropping anything that doesn't look like the field it claims to be.
 */
export function sanitizeIdentityPayload(raw: Record<string, unknown> | null | undefined, options: SanitizeOptions): SanitizedPayload {
    const warnings: string[] = [];

    if (!raw || typeof raw !== 'object') {
        return { detected: false, confidence: 'low', fields: {}, warnings: [] };
    }

    const rawFields = (raw.fields && typeof raw.fields === 'object' && !Array.isArray(raw.fields) ? raw.fields : {}) as Record<string, unknown>;
    const fields: IdentityDocumentFields = {};

    for (const key of TEXT_KEYS) {
        const value = asShortText(rawFields[key]);
        if (value) fields[key] = value as never;
    }

    const cnp = asCleanString(rawFields.cnp)?.replace(/[\s.\-]/g, '');
    if (cnp) {
        if (!options.strict || /^\d{13}$/.test(cnp)) {
            fields.cnp = cnp;
        } else {
            warnings.push('CNP-ul nu a putut fi citit corect. Completeaza-l manual.');
        }
    }

    const series = asCleanString(rawFields.id_series)?.replace(/[\s.\-]/g, '').toUpperCase();
    if (series) {
        if (!options.strict || /^[A-Z]{2}$/.test(series)) {
            fields.id_series = series;
        } else {
            warnings.push('Seria actului de identitate nu a putut fi citita. Completeaz-o manual.');
        }
    }

    const number = asCleanString(rawFields.id_number)?.replace(/[\s.\-]/g, '');
    if (number) {
        if (!options.strict || /^\d{6}$/.test(number)) {
            fields.id_number = number;
        } else {
            warnings.push('Numarul actului de identitate nu a putut fi citit. Completeaza-l manual.');
        }
    }

    for (const key of DATE_KEYS) {
        const value = asCleanString(rawFields[key]);
        if (!value) continue;
        // Normalisation to ISO happens in the service; here we only reject
        // values that are obviously not dates at all.
        if (!options.strict || /\d{1,4}[.\-/]\d{1,2}[.\-/]\d{2,4}/.test(value)) {
            fields[key] = value as never;
        }
    }

    const rawAddress = rawFields.address;
    if (rawAddress && typeof rawAddress === 'object' && !Array.isArray(rawAddress)) {
        const address: ContractAddress = {};
        for (const key of ADDRESS_KEYS) {
            const value = asShortText((rawAddress as Record<string, unknown>)[key]);
            if (value) address[key] = value;
        }
        if (Object.keys(address).length > 0) fields.address = address;
    }

    const rawWarnings = Array.isArray(raw.warnings) ? raw.warnings : [];
    for (const entry of rawWarnings) {
        const value = asCleanString(entry);
        if (value && value.length <= 200) warnings.push(value);
    }

    const confidence = CONFIDENCE_VALUES.includes(raw.confidence as ExtractionConfidence) ? (raw.confidence as ExtractionConfidence) : 'low';

    // A "detected" flag with no field at all is meaningless — treat it as a miss
    // so the caller doesn't show an empty form and claim success.
    const detected = raw.detected === true && Object.keys(fields).length > 0;

    return { detected, confidence, fields, warnings };
}

export function toResult(payload: SanitizedPayload, provider: string): IdentityExtractionResult {
    return {
        detected: payload.detected,
        confidence: payload.confidence,
        fields: payload.fields,
        warnings: payload.warnings,
        provider,
    };
}

export function notAnIdentityDocument(provider: string, warning: string): IdentityExtractionResult {
    return { detected: false, confidence: 'low', fields: {}, warnings: [warning], provider };
}

/** Anthropic (and most vision APIs) accept only these four. */
export const SUPPORTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export type SupportedImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

export function toSupportedMimeType(mimeType: string): SupportedImageMimeType | null {
    const normalised = (mimeType || '').toLowerCase().split(';')[0].trim();
    const alias = normalised === 'image/jpg' ? 'image/jpeg' : normalised;
    return (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(alias) ? (alias as SupportedImageMimeType) : null;
}

export const UNSUPPORTED_IMAGE_WARNING = 'Formatul imaginii nu este acceptat. Incarca o fotografie JPG sau PNG.';
