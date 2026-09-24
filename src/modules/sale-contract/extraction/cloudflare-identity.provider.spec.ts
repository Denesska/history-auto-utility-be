import { ConfigService } from '@nestjs/config';
import { CloudflareIdentityProvider } from './cloudflare-identity.provider';
import { IdentityExtractionUnavailableError } from '../sale-contract.types';

const FAKE_VALID_CNP = '1950101412348';
const IMAGE = Buffer.from('fake-image-bytes');

const BASE_CONFIG = {
    CLOUDFLARE_ACCOUNT_ID: 'acc-123',
    CLOUDFLARE_AI_TOKEN: 'cf-token',
    CLOUDFLARE_VISION_MODEL: '@cf/meta/llama-3.2-11b-vision-instruct',
};

function configOf(values: Record<string, string | undefined>): ConfigService {
    return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function mockFetch(response: { ok?: boolean; status?: number; json?: unknown } | Error): jest.Mock {
    const fn = jest.fn();
    if (response instanceof Error) {
        fn.mockRejectedValue(response);
    } else {
        fn.mockResolvedValue({
            ok: response.ok ?? true,
            status: response.status ?? 200,
            json: async () => response.json,
        });
    }
    global.fetch = fn as unknown as typeof fetch;
    return fn;
}

const CLEAN_FIELDS = {
    last_name: 'Popescu',
    first_name: 'Ion',
    cnp: FAKE_VALID_CNP,
    id_series: 'XH',
    id_number: '123456',
    address: { county: 'Cluj', city: 'Cluj-Napoca', street: 'Str. Mihai Viteazu', street_number: '12' },
};

function workersAiBody(text: string) {
    return { success: true, errors: [], result: { response: text } };
}

describe('CloudflareIdentityProvider', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it('is disabled, not fatal, when the credentials are missing', async () => {
        const provider = new CloudflareIdentityProvider(configOf({}));
        expect(provider.isConfigured()).toBe(false);
        await expect(provider.extract(IMAGE, 'image/jpeg')).resolves.toBeNull();
    });

    it('calls the Workers AI run endpoint for the configured model', async () => {
        const fetchMock = mockFetch({ json: workersAiBody(JSON.stringify({ detected: true, confidence: 'high', fields: CLEAN_FIELDS, warnings: [] })) });
        const provider = new CloudflareIdentityProvider(configOf(BASE_CONFIG));

        const result = await provider.extract(IMAGE, 'image/jpeg');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc-123/ai/run/@cf/meta/llama-3.2-11b-vision-instruct');
        expect(init.headers.Authorization).toBe('Bearer cf-token');
        // AI Gateway stores request/response logs by default; these payloads are
        // identity documents, so the adapter opts out on every call.
        expect(init.headers['cf-aig-collect-log']).toBe('false');

        const body = JSON.parse(init.body);
        expect(body.temperature).toBe(0);
        expect(body.messages[0].content[1].image_url.url.startsWith('data:image/jpeg;base64,')).toBe(true);

        expect(result.detected).toBe(true);
        expect(result.provider).toBe('cloudflare');
        expect(result.fields.cnp).toBe(FAKE_VALID_CNP);
    });

    it('uses CLOUDFLARE_AI_GATEWAY_URL as the base URL when set', async () => {
        const fetchMock = mockFetch({ json: workersAiBody(JSON.stringify({ detected: true, confidence: 'medium', fields: CLEAN_FIELDS, warnings: [] })) });
        const provider = new CloudflareIdentityProvider(configOf({ ...BASE_CONFIG, CLOUDFLARE_AI_GATEWAY_URL: 'https://gateway.ai.cloudflare.com/v1/acc-123/hau/workers-ai/' }));

        await provider.extract(IMAGE, 'image/png');

        expect(fetchMock.mock.calls[0][0]).toBe('https://gateway.ai.cloudflare.com/v1/acc-123/hau/workers-ai/@cf/meta/llama-3.2-11b-vision-instruct');
    });

    it('recovers JSON wrapped in prose and a markdown fence', async () => {
        const wrapped = ['Sigur! Iata datele extrase din documentul furnizat:', '```json', JSON.stringify({ detected: true, confidence: 'medium', fields: CLEAN_FIELDS, warnings: ['Adresa este partial acoperita.'] }), '```', 'Spune-mi daca mai ai nevoie de ceva.'].join('\n');
        mockFetch({ json: workersAiBody(wrapped) });
        const provider = new CloudflareIdentityProvider(configOf(BASE_CONFIG));

        const result = await provider.extract(IMAGE, 'image/jpeg');

        expect(result.detected).toBe(true);
        expect(result.confidence).toBe('medium');
        expect(result.fields.last_name).toBe('Popescu');
        expect(result.warnings).toContain('Adresa este partial acoperita.');
    });

    it('recovers a bare JSON object embedded in prose without a fence', async () => {
        const wrapped = `Am analizat imaginea. Rezultatul este ${JSON.stringify({ detected: true, confidence: 'low', fields: { last_name: 'Ionescu', cnp: FAKE_VALID_CNP }, warnings: [] })} — verifica datele.`;
        mockFetch({ json: workersAiBody(wrapped) });
        const provider = new CloudflareIdentityProvider(configOf(BASE_CONFIG));

        const result = await provider.extract(IMAGE, 'image/jpeg');

        expect(result.detected).toBe(true);
        expect(result.fields.cnp).toBe(FAKE_VALID_CNP);
    });

    it('returns detected: false with a warning when the answer cannot be salvaged', async () => {
        mockFetch({ json: workersAiBody('Nu pot ajuta cu analiza documentelor de identitate.') });
        const provider = new CloudflareIdentityProvider(configOf(BASE_CONFIG));

        const result = await provider.extract(IMAGE, 'image/jpeg');

        expect(result).not.toBeNull();
        expect(result.detected).toBe(false);
        expect(result.confidence).toBe('low');
        expect(result.fields).toEqual({});
        expect(result.warnings).toHaveLength(1);
    });

    it('drops field values that cannot be right for their field', async () => {
        mockFetch({
            json: workersAiBody(
                JSON.stringify({
                    detected: true,
                    confidence: 'high',
                    fields: {
                        last_name: 'Popescu',
                        cnp: '1234',
                        id_series: 'XH123456',
                        id_number: 'N/A',
                        issue_date: 'anul trecut',
                        address: { street: 'Str. Reala', apartment: 'unknown' },
                    },
                    warnings: [],
                }),
            ),
        });
        const provider = new CloudflareIdentityProvider(configOf(BASE_CONFIG));

        const result = await provider.extract(IMAGE, 'image/jpeg');

        expect(result.fields.last_name).toBe('Popescu');
        expect(result.fields.cnp).toBeUndefined();
        expect(result.fields.id_series).toBeUndefined();
        expect(result.fields.id_number).toBeUndefined();
        expect(result.fields.issue_date).toBeUndefined();
        expect(result.fields.address).toEqual({ street: 'Str. Reala' });
        // One warning per dropped, implausible value.
        expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    });

    it('maps a 503 to IdentityExtractionUnavailableError', async () => {
        mockFetch({ ok: false, status: 503 });
        const provider = new CloudflareIdentityProvider(configOf(BASE_CONFIG));

        await expect(provider.extract(IMAGE, 'image/jpeg')).rejects.toBeInstanceOf(IdentityExtractionUnavailableError);
    });

    it('maps a 429 to IdentityExtractionUnavailableError', async () => {
        mockFetch({ ok: false, status: 429 });
        const provider = new CloudflareIdentityProvider(configOf(BASE_CONFIG));

        await expect(provider.extract(IMAGE, 'image/jpeg')).rejects.toBeInstanceOf(IdentityExtractionUnavailableError);
    });

    it('returns null on a 401 rather than pretending to be an outage', async () => {
        mockFetch({ ok: false, status: 401 });
        const provider = new CloudflareIdentityProvider(configOf(BASE_CONFIG));

        await expect(provider.extract(IMAGE, 'image/jpeg')).resolves.toBeNull();
    });

    it('returns null when the Workers AI envelope reports failure', async () => {
        mockFetch({ json: { success: false, errors: [{ code: 7001, message: 'No route for that URI' }] } });
        const provider = new CloudflareIdentityProvider(configOf(BASE_CONFIG));

        await expect(provider.extract(IMAGE, 'image/jpeg')).resolves.toBeNull();
    });

    it('treats a network failure as unavailable', async () => {
        mockFetch(Object.assign(new TypeError('fetch failed'), { name: 'TypeError' }));
        const provider = new CloudflareIdentityProvider(configOf(BASE_CONFIG));

        await expect(provider.extract(IMAGE, 'image/jpeg')).rejects.toBeInstanceOf(IdentityExtractionUnavailableError);
    });
});
