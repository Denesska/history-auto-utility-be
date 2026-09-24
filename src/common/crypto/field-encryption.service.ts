import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM: authenticated encryption, so a tampered blob fails loudly instead of
 * decrypting to garbage that the PDF filler would happily print onto a contract.
 */
const ALGORITHM = 'aes-256-gcm';

/**
 * 12 bytes is the IV size GCM is specified for — with a 12-byte IV the value is used
 * as the counter block directly, while any other length is hashed through GHASH first,
 * which is both slower and outside the well-analysed parameter set.
 */
const IV_LENGTH = 12;

/** GCM's full-length tag. Truncating it would weaken forgery resistance for no gain here. */
const AUTH_TAG_LENGTH = 16;

/** AES-256 needs exactly 32 bytes of key material. */
const KEY_LENGTH = 32;

/** The env var an operator must set. Named in every error message so ops never has to guess. */
const KEY_ENV_VAR = 'CONTRACT_ENCRYPTION_KEY';

/**
 * Version tag written as the first segment of every blob.
 *
 * Without it, rotating the key (or switching cipher/format) later means guessing which
 * scheme each historical row used. With it, `decrypt` dispatches on an explicit marker and
 * an unsupported value fails with a readable message instead of an auth-tag error that
 * looks identical to tampering.
 */
const CURRENT_VERSION = 'v1';

/** Versions this build can still read. A future v2 adds its entry here, not a new class. */
const SUPPORTED_VERSIONS = new Set<string>([CURRENT_VERSION]);

/** `.` never appears in standard base64, so it is an unambiguous segment separator. */
const SEGMENT_SEPARATOR = '.';

const BLOB_SEGMENT_COUNT = 4;

/**
 * Thrown when encryption is asked for but no usable key is configured.
 *
 * Deliberately a use-time failure rather than a bootstrap failure — see the class doc on
 * FieldEncryptionService for why. Callers that can degrade gracefully should check
 * `isConfigured()` first; callers that cannot should let this propagate as a 500, because
 * storing a party payload in the clear is not an acceptable fallback.
 */
export class FieldEncryptionNotConfiguredError extends Error {
    constructor() {
        super(
            `${KEY_ENV_VAR} is not configured or is not a valid key. ` +
                `Expected a base64-encoded string decoding to exactly ${KEY_LENGTH} bytes ` +
                `(e.g. the output of: openssl rand -base64 ${KEY_LENGTH}).`,
        );
        this.name = 'FieldEncryptionNotConfiguredError';
    }
}

/**
 * Thrown when a blob cannot even be parsed: wrong segment count, unknown version, or
 * IV/auth-tag segments of the wrong size.
 *
 * Kept distinct from FieldDecryptionError on purpose. This one means "this string was never
 * one of our blobs" (a schema/migration/wiring bug), whereas FieldDecryptionError means
 * "this was one of ours but no longer verifies" (tampering, or the wrong key) — two very
 * different incidents that should not be triaged from the same alert.
 */
export class MalformedEncryptedFieldError extends Error {
    constructor(reason: string) {
        super(`Encrypted field is malformed: ${reason}.`);
        this.name = 'MalformedEncryptedFieldError';
    }
}

/**
 * Thrown when the GCM authentication tag does not verify.
 *
 * Node raises a generic Error ("Unsupported state or unable to authenticate data") for this,
 * which is easy to swallow in a broad catch. A named class makes "someone edited a
 * data_encrypted column" or "we are decrypting with the wrong key" impossible to miss.
 *
 * The message intentionally does not distinguish tampering from a key mismatch — we cannot
 * tell them apart, and guessing in an error string would be misleading during an incident.
 */
export class FieldDecryptionError extends Error {
    constructor() {
        super('Encrypted field failed authentication — it was modified, or encrypted with a different key.');
        this.name = 'FieldDecryptionError';
    }
}

/**
 * Application-level encryption for the personal data attached to a vehicle sale contract
 * (name, address, fiscal domicile, ID series/number, CNP).
 *
 * Why this exists at all: one of the two parties to a sale is a third party who never signed
 * up for this app, and their CNP is exactly the kind of identifier that must not sit in the
 * clear in Postgres. Encrypting in the application means a database dump, a backup, or a
 * stray `SELECT *` in a support session yields opaque blobs rather than identity documents.
 *
 * Missing key is treated as "feature disabled" rather than a startup failure, matching
 * GeminiExtractionService's handling of GEMINI_API_KEY: the dev checkout is shared with the
 * test server, so a hard requirement here would risk crashing bootstrap in environments that
 * have nothing to do with sale contracts. The cost of that choice is that the failure surfaces
 * later, at the first encrypt/decrypt call — which is why the warning below is emitted loudly
 * at construction and why `isConfigured()` is part of the public API.
 *
 * Logging rule for this whole file: no plaintext, no ciphertext, no key, no IV, at any level,
 * including inside error messages. Error messages name the failure category only.
 */
@Injectable()
export class FieldEncryptionService {
    private readonly logger = new Logger(FieldEncryptionService.name);

    /** Null whenever the env var is absent or unusable — the "feature disabled" state. */
    private readonly key: Buffer | null;

    constructor(private readonly config: ConfigService) {
        this.key = this.loadKey();
    }

    /**
     * True when a usable key is present. Callers that can offer a degraded experience
     * (e.g. hide the contract feature) should branch on this instead of catching the
     * not-configured error.
     */
    isConfigured(): boolean {
        return this.key !== null;
    }

    /**
     * JSON-serialises `value` and encrypts it into a single opaque blob, which is what the
     * `data_encrypted` columns store. The whole party payload travels as one unit so that no
     * field — not even a name — is individually queryable or individually leakable.
     */
    encryptObject<T>(value: T): string {
        return this.encrypt(JSON.stringify(value));
    }

    /**
     * Inverse of `encryptObject`. A blob that decrypts but does not parse as JSON is reported
     * as malformed rather than as a decryption failure: the ciphertext was authentic, so the
     * bug is in what we wrote, not in the storage layer.
     */
    decryptObject<T>(blob: string): T {
        const plaintext = this.decrypt(blob);
        try {
            return JSON.parse(plaintext) as T;
        } catch {
            // The parse error's message can quote the offending plaintext, so it is discarded.
            throw new MalformedEncryptedFieldError('decrypted payload is not valid JSON');
        }
    }

    /**
     * Encrypts a UTF-8 string into `v1.<iv>.<authTag>.<ciphertext>`, all three binary segments
     * base64-encoded.
     *
     * The IV is freshly generated per call and is never derived, cached, counted or reused.
     * This is not a tuning knob: reusing an IV across two encryptions under the same GCM key
     * leaks the XOR of the two plaintexts and, worse, allows recovery of the authentication
     * subkey — which would let an attacker forge blobs that verify. If you are editing this
     * method, the `randomBytes` call stays inside it.
     *
     * Note: no additional authenticated data is bound to the blob, so the ciphertext is not
     * tied to the row that holds it. An attacker who can already write to the database could
     * move a blob between rows (it would still decrypt). Defending against that requires
     * passing the row identity as AAD, which the storage layer does not have at encrypt time
     * today; it is a deliberate, documented limitation rather than an oversight.
     */
    encrypt(plaintext: string): string {
        const key = this.requireKey();
        const iv = randomBytes(IV_LENGTH);

        const cipher = createCipheriv(ALGORITHM, key, iv);
        const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return [CURRENT_VERSION, iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(
            SEGMENT_SEPARATOR,
        );
    }

    /**
     * Parses and verifies a blob produced by `encrypt`.
     *
     * Structure is validated before any crypto runs so that a wiring mistake (a plaintext
     * column, a truncated value, a future version) is reported as such instead of being
     * funnelled into a generic authentication failure.
     */
    decrypt(blob: string): string {
        const key = this.requireKey();

        if (typeof blob !== 'string' || blob.length === 0) {
            throw new MalformedEncryptedFieldError('value is empty');
        }

        const segments = blob.split(SEGMENT_SEPARATOR);
        if (segments.length !== BLOB_SEGMENT_COUNT) {
            throw new MalformedEncryptedFieldError(
                `expected ${BLOB_SEGMENT_COUNT} '${SEGMENT_SEPARATOR}'-separated segments, found ${segments.length}`,
            );
        }

        const [version, ivB64, authTagB64, ciphertextB64] = segments;

        if (!SUPPORTED_VERSIONS.has(version)) {
            // Naming the version is safe (it is a constant, not data) and is the single most
            // useful fact during a rotation gone wrong.
            throw new MalformedEncryptedFieldError(
                `unsupported format version '${version}', this build reads [${[...SUPPORTED_VERSIONS].join(', ')}]`,
            );
        }

        const iv = Buffer.from(ivB64, 'base64');
        const authTag = Buffer.from(authTagB64, 'base64');
        const ciphertext = Buffer.from(ciphertextB64, 'base64');

        // Length checks, not value checks — `setAuthTag` throws a confusingly-worded error for
        // a wrong-sized tag, and that would be misfiled as tampering.
        if (iv.length !== IV_LENGTH) {
            throw new MalformedEncryptedFieldError(`IV segment is ${iv.length} bytes, expected ${IV_LENGTH}`);
        }
        if (authTag.length !== AUTH_TAG_LENGTH) {
            throw new MalformedEncryptedFieldError(
                `auth tag segment is ${authTag.length} bytes, expected ${AUTH_TAG_LENGTH}`,
            );
        }

        try {
            const decipher = createDecipheriv(ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);
            return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
        } catch {
            // The underlying error is swallowed rather than wrapped: it carries no useful detail
            // beyond "did not authenticate", and re-throwing it risks a future Node version
            // including buffer contents in the message.
            throw new FieldDecryptionError();
        }
    }

    private requireKey(): Buffer {
        if (!this.key) {
            throw new FieldEncryptionNotConfiguredError();
        }
        return this.key;
    }

    /**
     * Reads and validates the key at construction.
     *
     * Returns null (plus a warning) instead of throwing, for the shared-checkout reason in the
     * class doc. The warning deliberately states only whether the variable was absent or
     * unusable — never the value, not even a prefix or a length, since both narrow a brute
     * force. The precise expectation ("base64, 32 bytes") lives in the thrown error so an
     * operator who hits it at runtime gets the full recipe.
     */
    private loadKey(): Buffer | null {
        const raw = this.config.get<string>(KEY_ENV_VAR);

        if (!raw || raw.trim().length === 0) {
            this.logger.warn(`${KEY_ENV_VAR} is not set — sale-contract field encryption is disabled.`);
            return null;
        }

        const trimmed = raw.trim();
        let decoded: Buffer;
        try {
            decoded = Buffer.from(trimmed, 'base64');
        } catch {
            decoded = Buffer.alloc(0);
        }

        if (decoded.length !== KEY_LENGTH) {
            this.logger.warn(
                `${KEY_ENV_VAR} is set but is not a base64-encoded ${KEY_LENGTH}-byte key — ` +
                    'sale-contract field encryption is disabled.',
            );
            return null;
        }

        // Node's base64 decoder silently discards characters it does not recognise, so a
        // mangled key (a truncated paste, a stray quote, a hex string) can still decode to
        // something 32 bytes long. Re-encoding and comparing catches that class of typo, which
        // is otherwise only discovered when rows encrypted under the wrong key fail to decrypt.
        if (normaliseBase64(decoded.toString('base64')) !== normaliseBase64(trimmed)) {
            this.logger.warn(
                `${KEY_ENV_VAR} is set but is not cleanly base64-encoded — ` +
                    'sale-contract field encryption is disabled.',
            );
            return null;
        }

        return decoded;
    }
}

/** Strips padding and folds the base64url alphabet onto base64, so equivalent spellings of the
 *  same key material compare equal. */
function normaliseBase64(value: string): string {
    return value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
}
