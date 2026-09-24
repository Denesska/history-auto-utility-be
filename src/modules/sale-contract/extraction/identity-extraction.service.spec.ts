import { ConfigService } from '@nestjs/config';
import sharp = require('sharp');
import { IdentityExtractionService } from './identity-extraction.service';
import { ClaudeIdentityProvider } from './claude-identity.provider';
import { CloudflareIdentityProvider } from './cloudflare-identity.provider';
import { IdentityExtractionProvider, IdentityExtractionResult, IdentityExtractionUnavailableError } from '../sale-contract.types';

/**
 * A syntactically valid, made-up CNP: male, born 1995-01-01, county 41,
 * sequence 234, control digit 8 (computed with the official 279146358279
 * weights). It belongs to nobody — never put a real CNP in a fixture.
 */
const FAKE_VALID_CNP = '1950101412348';
/** Same digits with a deliberately wrong control digit. */
const FAKE_INVALID_CNP = '1950101412341';

class StubProvider implements IdentityExtractionProvider {
    /** What the service actually forwarded, for the preprocessing tests below. */
    receivedImage: Buffer | null = null;
    receivedMimeType: string | null = null;

    constructor(
        readonly name: string,
        private configured: boolean,
        public result: IdentityExtractionResult | null = null,
        public error: Error | null = null,
    ) {}

    isConfigured(): boolean {
        return this.configured;
    }

    async extract(image: Buffer, mimeType: string): Promise<IdentityExtractionResult | null> {
        this.receivedImage = image;
        this.receivedMimeType = mimeType;
        if (this.error) throw this.error;
        return this.result;
    }
}

function configOf(values: Record<string, string | undefined>): ConfigService {
    return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function buildService(values: Record<string, string | undefined>, claude: IdentityExtractionProvider, cloudflare: IdentityExtractionProvider): IdentityExtractionService {
    return new IdentityExtractionService(configOf(values), claude as unknown as ClaudeIdentityProvider, cloudflare as unknown as CloudflareIdentityProvider);
}

function resultWith(provider: string, fields: IdentityExtractionResult['fields'], warnings: string[] = []): IdentityExtractionResult {
    return { detected: true, confidence: 'high', fields, warnings, provider };
}

const IMAGE = Buffer.from('not-a-real-image');

describe('IdentityExtractionService', () => {
    describe('provider selection', () => {
        it('uses the provider named by IDENTITY_EXTRACTION_PROVIDER', () => {
            const claude = new StubProvider('claude', true);
            const cloudflare = new StubProvider('cloudflare', true);
            const service = buildService({ IDENTITY_EXTRACTION_PROVIDER: 'cloudflare' }, claude, cloudflare);
            expect(service.activeProvider).toBe('cloudflare');
        });

        it('ignores case and surrounding whitespace in the env var', () => {
            const service = buildService({ IDENTITY_EXTRACTION_PROVIDER: '  CLAUDE ' }, new StubProvider('claude', true), new StubProvider('cloudflare', true));
            expect(service.activeProvider).toBe('claude');
        });

        it('falls back to the only configured provider when the env var is unset', () => {
            const service = buildService({}, new StubProvider('claude', false), new StubProvider('cloudflare', true));
            expect(service.activeProvider).toBe('cloudflare');
        });

        it('falls back when the requested provider has no credentials', () => {
            const service = buildService({ IDENTITY_EXTRACTION_PROVIDER: 'cloudflare' }, new StubProvider('claude', true), new StubProvider('cloudflare', false));
            expect(service.activeProvider).toBe('claude');
        });

        it('falls back when the env var names an unknown provider', () => {
            const service = buildService({ IDENTITY_EXTRACTION_PROVIDER: 'openai' }, new StubProvider('claude', true), new StubProvider('cloudflare', false));
            expect(service.activeProvider).toBe('claude');
        });

        it('reports disabled when neither provider is configured', async () => {
            const service = buildService({}, new StubProvider('claude', false), new StubProvider('cloudflare', false));
            expect(service.activeProvider).toBeNull();
            expect(service.isEnabled()).toBe(false);
            await expect(service.extract(IMAGE, 'image/jpeg')).resolves.toBeNull();
        });
    });

    describe('extract', () => {
        it('normalises a clean extraction', async () => {
            const claude = new StubProvider(
                'claude',
                true,
                resultWith('claude', {
                    last_name: 'Popescu',
                    first_name: 'Ion  Andrei',
                    cnp: `195 0101 41234 8`,
                    id_series: 'xh',
                    id_number: '12 34 56',
                    issue_date: '12.03.2015',
                    valid_until: '2025-03-12',
                    address: { county: 'Cluj', city: 'Cluj-Napoca', street: 'Str.  Mihai Viteazu', street_number: '12', apartment: '3' },
                }),
            );
            const service = buildService({ IDENTITY_EXTRACTION_PROVIDER: 'claude' }, claude, new StubProvider('cloudflare', false));

            const result = await service.extract(IMAGE, 'image/jpeg');

            expect(result).not.toBeNull();
            expect(result.detected).toBe(true);
            expect(result.provider).toBe('claude');
            expect(result.confidence).toBe('high');
            expect(result.fields.cnp).toBe(FAKE_VALID_CNP);
            expect(result.fields.id_series).toBe('XH');
            expect(result.fields.id_number).toBe('123456');
            expect(result.fields.full_name).toBe('Popescu Ion  Andrei');
            expect(result.fields.issue_date).toBe('2015-03-12');
            expect(result.fields.valid_until).toBe('2025-03-12');
            expect(result.fields.address.street).toBe('Str. Mihai Viteazu');
            expect(result.warnings).toEqual([]);
        });

        it('keeps a CNP that fails the checksum, downgrades confidence and warns', async () => {
            const claude = new StubProvider('claude', true, resultWith('claude', { last_name: 'Popescu', first_name: 'Ion', cnp: FAKE_INVALID_CNP }));
            const service = buildService({ IDENTITY_EXTRACTION_PROVIDER: 'claude' }, claude, new StubProvider('cloudflare', false));

            const result = await service.extract(IMAGE, 'image/jpeg');

            // The value is retained on purpose: the user has to see what was read
            // to be able to correct the one wrong digit.
            expect(result.fields.cnp).toBe(FAKE_INVALID_CNP);
            expect(result.confidence).toBe('low');
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('leaves a valid CNP and its confidence alone', async () => {
            const claude = new StubProvider('claude', true, resultWith('claude', { cnp: FAKE_VALID_CNP }));
            const service = buildService({ IDENTITY_EXTRACTION_PROVIDER: 'claude' }, claude, new StubProvider('cloudflare', false));

            const result = await service.extract(IMAGE, 'image/jpeg');

            expect(result.fields.cnp).toBe(FAKE_VALID_CNP);
            expect(result.confidence).toBe('high');
            expect(result.warnings).toEqual([]);
        });

        it('drops an uninterpretable date and warns instead of guessing', async () => {
            const claude = new StubProvider('claude', true, resultWith('claude', { last_name: 'Popescu', issue_date: 'martie 2015' }));
            const service = buildService({ IDENTITY_EXTRACTION_PROVIDER: 'claude' }, claude, new StubProvider('cloudflare', false));

            const result = await service.extract(IMAGE, 'image/jpeg');

            expect(result.fields.issue_date).toBeUndefined();
            expect(result.warnings.length).toBe(1);
        });

        it('lets IdentityExtractionUnavailableError through so the API can answer 503', async () => {
            const claude = new StubProvider('claude', true, null, new IdentityExtractionUnavailableError('claude'));
            const service = buildService({ IDENTITY_EXTRACTION_PROVIDER: 'claude' }, claude, new StubProvider('cloudflare', false));

            await expect(service.extract(IMAGE, 'image/jpeg')).rejects.toBeInstanceOf(IdentityExtractionUnavailableError);
        });

        it('returns null when the provider throws anything else', async () => {
            const claude = new StubProvider('claude', true, null, new Error('boom'));
            const service = buildService({ IDENTITY_EXTRACTION_PROVIDER: 'claude' }, claude, new StubProvider('cloudflare', false));

            await expect(service.extract(IMAGE, 'image/jpeg')).resolves.toBeNull();
        });

        it('never logs an extracted value', async () => {
            const written: string[] = [];
            const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
                jest.spyOn(require('@nestjs/common').Logger.prototype, level).mockImplementation((...args: unknown[]) => {
                    written.push(args.map(String).join(' '));
                }),
            );

            const claude = new StubProvider('claude', true, resultWith('claude', { last_name: 'Popescu', first_name: 'Ion', cnp: FAKE_INVALID_CNP, id_series: 'XH', id_number: '123456', address: { street: 'Str. Secreta' } }));
            const service = buildService({ IDENTITY_EXTRACTION_PROVIDER: 'claude' }, claude, new StubProvider('cloudflare', false));
            await service.extract(IMAGE, 'image/jpeg');

            const all = written.join('\n');
            expect(all).not.toContain(FAKE_INVALID_CNP);
            expect(all).not.toContain('Popescu');
            expect(all).not.toContain('Secreta');
            expect(all).not.toContain('123456');

            spies.forEach((s) => s.mockRestore());
        });
    });

    describe('image preprocessing', () => {
        it('downscales and re-encodes a large photo before it reaches the provider', async () => {
            const large = await sharp({ create: { width: 4096, height: 3072, channels: 3, background: { r: 200, g: 200, b: 200 } } })
                .jpeg({ quality: 100 })
                .toBuffer();

            const cloudflare = new StubProvider('cloudflare', true, resultWith('cloudflare', {}));
            const service = buildService({ IDENTITY_EXTRACTION_PROVIDER: 'cloudflare' }, new StubProvider('claude', false), cloudflare);
            await service.extract(large, 'image/jpeg');

            expect(cloudflare.receivedImage).not.toBeNull();
            expect(cloudflare.receivedImage!.length).toBeLessThan(large.length);
            expect(cloudflare.receivedMimeType).toBe('image/jpeg');

            const metadata = await sharp(cloudflare.receivedImage!).metadata();
            expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(1600);
        });

        it('leaves an already-small image alone rather than re-encoding for no gain', async () => {
            const small = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 10, b: 10 } } })
                .jpeg({ quality: 90 })
                .toBuffer();

            const cloudflare = new StubProvider('cloudflare', true, resultWith('cloudflare', {}));
            const service = buildService({ IDENTITY_EXTRACTION_PROVIDER: 'cloudflare' }, new StubProvider('claude', false), cloudflare);
            await service.extract(small, 'image/jpeg');

            expect(cloudflare.receivedImage).toBe(small);
        });

        it('falls back to the original bytes when the buffer is not decodable image data', async () => {
            const cloudflare = new StubProvider('cloudflare', true, resultWith('cloudflare', {}));
            const service = buildService({ IDENTITY_EXTRACTION_PROVIDER: 'cloudflare' }, new StubProvider('claude', false), cloudflare);
            await service.extract(IMAGE, 'image/jpeg');

            expect(cloudflare.receivedImage).toBe(IMAGE);
            expect(cloudflare.receivedMimeType).toBe('image/jpeg');
        });
    });
});
