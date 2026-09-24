/**
 * Keeping personal data out of the logs.
 *
 * The sale-contract feature puts CNPs, ID card series/numbers and home addresses into the
 * request path, and this codebase logs error messages fairly freely (see the `catch` blocks in
 * the document module, which log `err.message` verbatim). That combination is how a national
 * identification number ends up in a log aggregator that was never scoped for it.
 *
 * So there is exactly one obvious way to scrub a value before it goes near a logger:
 *   this.logger.error(`… failed: ${JSON.stringify(redact(payload))}`);
 *   this.logger.error(`vendor said: ${redactText(err.message)}`);
 *
 * Both helpers run on the error path, where throwing would replace the original problem with a
 * new and less interesting one. Neither ever throws; both bail out to a placeholder instead.
 */

/**
 * Keys whose values are personal data. Matched case-insensitively against the exact key name.
 *
 * Mirrors the field names in sale-contract.types.ts (ContractPartyData, ContractAddress,
 * ContractRepresentative, IdentityDocumentFields) plus the identifiers the rest of the app
 * already carries.
 */
const SENSITIVE_KEYS = new Set<string>([
    // Identifiers
    'cnp',
    'cnp_or_cif',
    'cif',
    'cui',
    'id_series',
    'id_number',
    'series',
    'passport',
    'iban',
    // Names
    'name',
    'full_name',
    'first_name',
    'last_name',
    'maiden_name',
    'owner_name',
    'policyholder_name',
    // Contact
    'phone',
    'email',
    // Address, and every sub-field of ContractAddress
    'address',
    'fiscal_address',
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
    // Identity-document extras
    'issued_by',
    'place_of_birth',
    'birth_date',
    'date_of_birth',
    // Credentials that must never be logged either
    'password',
    'token',
    'secret',
]);

/**
 * Suffixes that make a key sensitive regardless of its prefix, so fields nobody thought to
 * enumerate (`seller_full_name`, `buyer_cnp`, `contact_email`, …) are covered by default.
 */
const SENSITIVE_KEY_SUFFIXES = ['_name', '_cnp', '_cif', '_email', '_phone', '_address', '_number', '_series'];

/**
 * Deliberately over-broad: bare `name` is in the list, which also masks harmless things like
 * a provider's name. That is the right trade — an over-redacted log costs a developer one
 * extra debugging step, an under-redacted one is a reportable incident.
 */
function isSensitiveKey(key: string): boolean {
    const normalised = key.toLowerCase();
    if (SENSITIVE_KEYS.has(normalised)) return true;
    return SENSITIVE_KEY_SUFFIXES.some((suffix) => normalised.endsWith(suffix));
}

/**
 * Masked values show the length and nothing else: `[redacted:13]`.
 *
 * The alternative — keeping the last two characters as a debugging hint — was rejected. For a
 * CNP those two characters are the county-code tail and the control digit, which together with
 * the checksum relation narrow the space considerably; for an e-mail address or a surname they
 * are simply a fragment of the real value, and "only a fragment" is not a defence under GDPR.
 * Length alone is enough for what these logs are actually used for: telling "the field arrived
 * empty" apart from "the field arrived truncated" apart from "the field arrived fine, the bug
 * is elsewhere".
 */
function maskPrimitive(value: unknown): string {
    if (typeof value === 'string') return `[redacted:${value.length}]`;
    if (typeof value === 'number') return `[redacted:${String(value).length}]`;
    return '[redacted]';
}

/** Depth and node budgets keep the cost bounded — this runs while something is already going
 *  wrong, and a deeply nested payload must not turn a handled error into a slow one. */
const MAX_DEPTH = 8;
const MAX_NODES = 1000;

/**
 * Deep-copies `value`, masking everything that looks like personal data, and returns something
 * structurally similar that is safe to log.
 *
 * Objects and arrays are walked rather than replaced wholesale, so the shape survives: an
 * `address` still logs as an object with the same keys, just with masked leaves. Once a
 * sensitive key is entered, everything below it is masked too — `representative` holding a
 * `full_name` two levels down does not escape because the intermediate key looked innocuous.
 *
 * Never throws. Cycles become `[circular]`, and anything unexpected degrades to a placeholder.
 */
export function redact(value: unknown): unknown {
    try {
        return walk(value, false, 0, new WeakSet<object>(), { count: 0 });
    } catch {
        // Unreachable in principle — getters on exotic objects make it reachable in practice.
        return '[redaction-failed]';
    }
}

function walk(
    value: unknown,
    forceMask: boolean,
    depth: number,
    seen: WeakSet<object>,
    budget: { count: number },
): unknown {
    if (budget.count++ > MAX_NODES) return '[truncated]';

    // null/undefined pass through unmasked on purpose: "this field was absent" is often the
    // whole answer during debugging, and absence discloses nothing about a person.
    if (value === null || value === undefined) return value;

    const type = typeof value;

    if (type === 'string' || type === 'number' || type === 'boolean' || type === 'bigint') {
        return forceMask ? maskPrimitive(value) : value;
    }

    // Functions and symbols have no business in a log line either way.
    if (type === 'function' || type === 'symbol') return `[${type}]`;

    // Buffers are never dumped: in this feature they are usually a photo of an ID card.
    if (Buffer.isBuffer(value)) return `[Buffer:${value.length}]`;

    if (value instanceof Date) {
        // A timestamp is only personal data when it is a date of birth, which by then is
        // already under a sensitive key.
        return forceMask ? '[redacted:date]' : value;
    }

    if (value instanceof Error) {
        // Third-party error messages are the exact thing redactText exists for.
        return { name: value.name, message: redactText(value.message) };
    }

    if (depth >= MAX_DEPTH) return '[max-depth]';

    if (seen.has(value as object)) return '[circular]';
    seen.add(value as object);

    try {
        if (Array.isArray(value)) {
            return value.map((item) => walk(item, forceMask, depth + 1, seen, budget));
        }

        if (value instanceof Map) {
            return Object.fromEntries(
                [...value.entries()].map(([key, item]) => [
                    String(key),
                    walk(item, forceMask || isSensitiveKey(String(key)), depth + 1, seen, budget),
                ]),
            );
        }

        if (value instanceof Set) {
            return [...value].map((item) => walk(item, forceMask, depth + 1, seen, budget));
        }

        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            out[key] = walk(item, forceMask || isSensitiveKey(key), depth + 1, seen, budget);
        }
        return out;
    } finally {
        // Released so that a value legitimately referenced twice in a tree (a shared address
        // object, say) is rendered both times instead of the second one reading `[circular]`.
        seen.delete(value as object);
    }
}

/**
 * 13 consecutive digits — the shape of a CNP. The lookarounds stop it matching a 13-digit run
 * inside a longer number (a request id, a timestamp in microseconds), which would corrupt
 * otherwise useful log lines.
 */
const CNP_PATTERN = /(?<!\d)\d{13}(?!\d)/g;

/**
 * Romanian ID card series and number: two letters then six digits, optionally separated
 * ("XH123456", "XH 123456", "XH-123456"). The same shape covers the series/number pair printed
 * on a passport, which is equally sensitive.
 */
const ID_SERIES_PATTERN = /(?<![A-Za-z0-9])[A-Za-z]{2}[ \-]?\d{6}(?![0-9])/g;

/** Conservative e-mail shape. Vendor errors echo the address they choked on surprisingly often. */
const EMAIL_PATTERN = /(?<![\w.+-])[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * Masks personal data inside free text — mainly third-party error messages, which quote back
 * whatever value upset them and are then logged verbatim.
 *
 * This is a net, not a guarantee: it catches the identifiers that have a recognisable shape.
 * Structured payloads should go through `redact` instead, which knows the field names.
 *
 * Never throws; a non-string argument yields an empty string.
 */
export function redactText(text: string): string {
    if (typeof text !== 'string' || text.length === 0) return '';

    try {
        // E-mail first: an address whose local part happens to be ID-series-shaped
        // ("ab123456@…") would otherwise be half-masked into something no pattern then
        // recognises as an address.
        return text
            .replace(EMAIL_PATTERN, '[redacted:email]')
            .replace(CNP_PATTERN, '[redacted:cnp]')
            .replace(ID_SERIES_PATTERN, '[redacted:id]');
    } catch {
        // A regex over a pathological string is the only realistic failure; losing the message
        // entirely beats letting the logging call take down the error handler around it.
        return '[redaction-failed]';
    }
}
