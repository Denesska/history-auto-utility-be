import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import {
    FieldDecryptionError,
    FieldEncryptionNotConfiguredError,
    FieldEncryptionService,
    MalformedEncryptedFieldError,
} from './field-encryption.service';

/** Keys are generated per run — a real key must never be committed, and a hardcoded fake one
 *  invites being pasted into an env file by mistake. */
const newKey = () => randomBytes(32).toString('base64');

/** Minimal ConfigService stand-in: the service only ever reads CONTRACT_ENCRYPTION_KEY. */
const configWith = (key: string | undefined) =>
    ({ get: (name: string) => (name === 'CONTRACT_ENCRYPTION_KEY' ? key : undefined) }) as unknown as ConfigService;

const serviceWith = (key: string | undefined) => new FieldEncryptionService(configWith(key));

/** Returns the error a call threw, so its message can be asserted on directly. */
function captureError(run: () => unknown): Error {
    try {
        run();
    } catch (err) {
        return err as Error;
    }
    throw new Error('expected the call to throw, but it returned normally');
}

/** A party payload shaped like ContractPartyData, diacritics included — the encoding round trip
 *  is the part most likely to break silently and show up as mojibake on a printed contract. */
const PARTY = {
    is_company: false,
    full_name: 'Ioana Mărgărit Țâru-Șerban',
    cnp_or_cif: '1234567890123',
    id_series: 'XH',
    id_number: '123456',
    address: {
        county: 'Bistrița-Năsăud',
        city: 'Sângeorz-Băi',
        street: 'Aleea Câmpului',
        street_number: '12A',
    },
    capacity: 'proprietar',
};

describe('FieldEncryptionService', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        // The unconfigured cases warn by design; silence it so the run stays readable.
        warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => warnSpy.mockRestore());

    describe('round trip', () => {
        it('restores a nested object with Romanian diacritics exactly', () => {
            const service = serviceWith(newKey());

            const blob = service.encryptObject(PARTY);
            expect(service.decryptObject(blob)).toEqual(PARTY);
        });

        it('produces a v1 blob of four base64 segments', () => {
            const service = serviceWith(newKey());

            const segments = service.encrypt('hello').split('.');

            expect(segments).toHaveLength(4);
            expect(segments[0]).toBe('v1');
            expect(Buffer.from(segments[1], 'base64')).toHaveLength(12);
            expect(Buffer.from(segments[2], 'base64')).toHaveLength(16);
        });

        it('does not leak the plaintext into the blob', () => {
            const service = serviceWith(newKey());

            expect(service.encryptObject(PARTY)).not.toContain('Ioana');
        });
    });

    describe('IV handling', () => {
        it('never reuses an IV, so the same plaintext encrypts to different ciphertext', () => {
            const service = serviceWith(newKey());

            const first = service.encrypt('same plaintext');
            const second = service.encrypt('same plaintext');

            expect(first).not.toEqual(second);
            expect(first.split('.')[1]).not.toEqual(second.split('.')[1]);
            // Both still decrypt — different ciphertext, same meaning.
            expect(service.decrypt(first)).toBe('same plaintext');
            expect(service.decrypt(second)).toBe('same plaintext');
        });

        it('draws a fresh IV on every call across many encryptions', () => {
            const service = serviceWith(newKey());

            const ivs = new Set(Array.from({ length: 200 }, () => service.encrypt('x').split('.')[1]));

            expect(ivs.size).toBe(200);
        });
    });

    describe('tampering and wrong keys', () => {
        it('raises FieldDecryptionError when the ciphertext is modified', () => {
            const service = serviceWith(newKey());
            const [version, iv, tag, ciphertext] = service.encryptObject(PARTY).split('.');

            const flipped = Buffer.from(ciphertext, 'base64');
            flipped[0] ^= 0xff;
            const tampered = [version, iv, tag, flipped.toString('base64')].join('.');

            expect(() => service.decryptObject(tampered)).toThrow(FieldDecryptionError);
        });

        it('raises FieldDecryptionError when the auth tag is modified', () => {
            const service = serviceWith(newKey());
            const [version, iv, tag, ciphertext] = service.encrypt('secret').split('.');

            const flipped = Buffer.from(tag, 'base64');
            flipped[0] ^= 0xff;
            const tampered = [version, iv, flipped.toString('base64'), ciphertext].join('.');

            expect(() => service.decrypt(tampered)).toThrow(FieldDecryptionError);
        });

        it('raises FieldDecryptionError when the IV is modified', () => {
            const service = serviceWith(newKey());
            const [version, iv, tag, ciphertext] = service.encrypt('secret').split('.');

            const flipped = Buffer.from(iv, 'base64');
            flipped[0] ^= 0xff;
            const tampered = [version, flipped.toString('base64'), tag, ciphertext].join('.');

            expect(() => service.decrypt(tampered)).toThrow(FieldDecryptionError);
        });

        it('fails cleanly when decrypting with a different key', () => {
            const blob = serviceWith(newKey()).encryptObject(PARTY);
            const other = serviceWith(newKey());

            expect(() => other.decryptObject(blob)).toThrow(FieldDecryptionError);
        });

        it('never mentions the key, IV or ciphertext in the error message', () => {
            const service = serviceWith(newKey());
            const blob = service.encrypt('secret');
            const [version, iv, tag, ciphertext] = blob.split('.');
            const flipped = Buffer.from(tag, 'base64');
            flipped[0] ^= 0xff;

            const tampered = [version, iv, flipped.toString('base64'), ciphertext].join('.');
            const error = captureError(() => service.decrypt(tampered));

            expect(error).toBeInstanceOf(FieldDecryptionError);
            expect(error.message).not.toContain(iv);
            expect(error.message).not.toContain(ciphertext);
            expect(error.message).not.toContain('secret');
        });
    });

    describe('format validation', () => {
        it('rejects an unknown version prefix and says so', () => {
            const service = serviceWith(newKey());
            const segments = service.encrypt('secret').split('.');
            segments[0] = 'v2';

            expect(() => service.decrypt(segments.join('.'))).toThrow(MalformedEncryptedFieldError);
            expect(() => service.decrypt(segments.join('.'))).toThrow(/unsupported format version 'v2'/);
        });

        it('rejects a value with the wrong number of segments', () => {
            const service = serviceWith(newKey());

            expect(() => service.decrypt('not-a-blob')).toThrow(MalformedEncryptedFieldError);
            expect(() => service.decrypt('v1.a.b')).toThrow(MalformedEncryptedFieldError);
        });

        it('rejects an empty value', () => {
            expect(() => serviceWith(newKey()).decrypt('')).toThrow(MalformedEncryptedFieldError);
        });

        it('rejects an IV or auth tag of the wrong size', () => {
            const service = serviceWith(newKey());
            const [version, iv, tag, ciphertext] = service.encrypt('secret').split('.');
            const short = Buffer.alloc(4).toString('base64');

            expect(() => service.decrypt([version, short, tag, ciphertext].join('.'))).toThrow(
                /IV segment is 4 bytes/,
            );
            expect(() => service.decrypt([version, iv, short, ciphertext].join('.'))).toThrow(
                /auth tag segment is 4 bytes/,
            );
        });

        it('reports authentic-but-unparseable payloads as malformed, not as tampering', () => {
            const service = serviceWith(newKey());

            // Legitimately encrypted, just not JSON — a bug on our side of the wire.
            const blob = service.encrypt('{not json');

            expect(() => service.decryptObject(blob)).toThrow(MalformedEncryptedFieldError);
        });
    });

    describe('when the key is not configured', () => {
        it('constructs without throwing and reports itself unconfigured', () => {
            let service: FieldEncryptionService;

            expect(() => (service = serviceWith(undefined))).not.toThrow();
            expect(service.isConfigured()).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('CONTRACT_ENCRYPTION_KEY'));
        });

        it('throws a clear, variable-naming error when encrypt is called anyway', () => {
            const service = serviceWith(undefined);

            expect(() => service.encryptObject(PARTY)).toThrow(FieldEncryptionNotConfiguredError);
            expect(() => service.encryptObject(PARTY)).toThrow(/CONTRACT_ENCRYPTION_KEY/);
            expect(() => service.encryptObject(PARTY)).toThrow(/base64/);
            expect(() => service.encryptObject(PARTY)).toThrow(/32 bytes/);
        });

        it('throws the same error when decrypt is called', () => {
            expect(() => serviceWith(undefined).decrypt('v1.a.b.c')).toThrow(FieldEncryptionNotConfiguredError);
        });

        it.each([
            ['an empty string', ''],
            ['whitespace only', '   '],
            ['a 16-byte key', randomBytes(16).toString('base64')],
            ['a 64-byte key', randomBytes(64).toString('base64')],
            ['a hex-encoded key', randomBytes(32).toString('hex')],
            ['a truncated paste', randomBytes(32).toString('base64').slice(0, 30)],
        ])('stays disabled rather than crashing for %s', (_label, key) => {
            let service: FieldEncryptionService;

            expect(() => (service = serviceWith(key))).not.toThrow();
            expect(service.isConfigured()).toBe(false);
        });

        it('accepts a well-formed key', () => {
            expect(serviceWith(newKey()).isConfigured()).toBe(true);
        });

        it('tolerates surrounding whitespace in the env value', () => {
            expect(serviceWith(`  ${newKey()}  `).isConfigured()).toBe(true);
        });
    });
});
