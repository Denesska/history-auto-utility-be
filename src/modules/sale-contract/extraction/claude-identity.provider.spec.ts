import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { ClaudeIdentityProvider } from './claude-identity.provider';
import { IdentityExtractionUnavailableError } from '../sale-contract.types';

const FAKE_VALID_CNP = '1950101412348';
const IMAGE = Buffer.from('fake-image-bytes');

function configOf(values: Record<string, string | undefined>): ConfigService {
    return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function buildProvider(values: Record<string, string | undefined> = { ANTHROPIC_API_KEY: 'sk-ant-test' }): { provider: ClaudeIdentityProvider; create: jest.Mock } {
    const provider = new ClaudeIdentityProvider(configOf(values));
    const create = jest.fn();
    // Replace the SDK transport — no test may reach the network.
    (provider as unknown as { client: unknown }).client = { messages: { create } };
    return { provider, create };
}

function messageWith(payload: unknown, stopReason = 'end_turn') {
    return { content: [{ type: 'text', text: JSON.stringify(payload) }], stop_reason: stopReason };
}

const CLEAN_PAYLOAD = {
    detected: true,
    confidence: 'high',
    fields: {
        last_name: 'Popescu',
        first_name: 'Ion',
        cnp: FAKE_VALID_CNP,
        id_series: 'XH',
        id_number: '123456',
        address: { county: 'Cluj', city: 'Cluj-Napoca', street: 'Str. Mihai Viteazu', street_number: '12' },
    },
    warnings: [],
};

describe('ClaudeIdentityProvider', () => {
    it('is disabled, not fatal, when ANTHROPIC_API_KEY is missing', async () => {
        const provider = new ClaudeIdentityProvider(configOf({}));
        expect(provider.isConfigured()).toBe(false);
        await expect(provider.extract(IMAGE, 'image/jpeg')).resolves.toBeNull();
    });

    it('sends the image, a strict schema and temperature 0', async () => {
        const { provider, create } = buildProvider();
        create.mockResolvedValue(messageWith(CLEAN_PAYLOAD));

        const result = await provider.extract(IMAGE, 'image/jpeg');

        expect(create).toHaveBeenCalledTimes(1);
        const request = create.mock.calls[0][0];
        expect(request.model).toBe('claude-haiku-4-5');
        expect(request.temperature).toBe(0);
        expect(request.output_config.format.type).toBe('json_schema');
        expect(request.output_config.format.schema.required).toEqual(['detected', 'confidence', 'fields', 'warnings']);
        expect(request.messages[0].content[0]).toEqual({
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE.toString('base64') },
        });
        expect(request.messages[0].content[1].type).toBe('text');

        expect(result).toEqual({
            detected: true,
            confidence: 'high',
            fields: CLEAN_PAYLOAD.fields,
            warnings: [],
            provider: 'claude',
        });
    });

    it('honours ANTHROPIC_IDENTITY_MODEL and omits temperature on models that reject it', async () => {
        const { provider, create } = buildProvider({ ANTHROPIC_API_KEY: 'sk-ant-test', ANTHROPIC_IDENTITY_MODEL: 'claude-opus-5' });
        create.mockResolvedValue(messageWith(CLEAN_PAYLOAD));

        await provider.extract(IMAGE, 'image/png');

        const request = create.mock.calls[0][0];
        expect(request.model).toBe('claude-opus-5');
        expect(request).not.toHaveProperty('temperature');
    });

    it('rejects an unsupported image type without calling the API', async () => {
        const { provider, create } = buildProvider();

        const result = await provider.extract(IMAGE, 'application/pdf');

        expect(create).not.toHaveBeenCalled();
        expect(result.detected).toBe(false);
        expect(result.warnings).toHaveLength(1);
    });

    it('treats "not an ID card" as detected: false, not as an error', async () => {
        const { provider, create } = buildProvider();
        create.mockResolvedValue(messageWith({ detected: false, confidence: 'low', fields: {}, warnings: ['Imaginea nu pare a fi o carte de identitate.'] }));

        const result = await provider.extract(IMAGE, 'image/jpeg');

        expect(result.detected).toBe(false);
        expect(result.warnings).toEqual(['Imaginea nu pare a fi o carte de identitate.']);
    });

    it('maps a 529 overload to IdentityExtractionUnavailableError', async () => {
        const { provider, create } = buildProvider();
        create.mockRejectedValue(new Anthropic.APIError(529, undefined, 'Overloaded', undefined));

        await expect(provider.extract(IMAGE, 'image/jpeg')).rejects.toBeInstanceOf(IdentityExtractionUnavailableError);
    });

    it('maps a rate limit to IdentityExtractionUnavailableError', async () => {
        const { provider, create } = buildProvider();
        create.mockRejectedValue(new Anthropic.RateLimitError(429, undefined, 'Rate limited', undefined as never));

        await expect(provider.extract(IMAGE, 'image/jpeg')).rejects.toBeInstanceOf(IdentityExtractionUnavailableError);
    });

    it('maps a connection failure to IdentityExtractionUnavailableError', async () => {
        const { provider, create } = buildProvider();
        create.mockRejectedValue(new Anthropic.APIConnectionError({ message: 'socket hang up' }));

        await expect(provider.extract(IMAGE, 'image/jpeg')).rejects.toBeInstanceOf(IdentityExtractionUnavailableError);
    });

    it('returns null (not an outage) on a 400', async () => {
        const { provider, create } = buildProvider();
        create.mockRejectedValue(new Anthropic.BadRequestError(400, undefined, 'bad request', undefined as never));

        await expect(provider.extract(IMAGE, 'image/jpeg')).resolves.toBeNull();
    });

    it('does not throw when the model refuses', async () => {
        const { provider, create } = buildProvider();
        create.mockResolvedValue({ content: [], stop_reason: 'refusal' });

        const result = await provider.extract(IMAGE, 'image/jpeg');

        expect(result.detected).toBe(false);
        expect(result.warnings).toHaveLength(1);
    });
});
