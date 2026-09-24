import { redact, redactText } from './redact.util';

describe('redact', () => {
    it('masks every sensitive field of a contract party while keeping the shape', () => {
        const party = {
            is_company: false,
            full_name: 'Ioana Țâru',
            cnp_or_cif: '1234567890123',
            id_series: 'XH',
            id_number: '123456',
            phone: '+40712345678',
            email: 'ioana@example.ro',
            address: {
                county: 'Cluj',
                city: 'Cluj-Napoca',
                street: 'Aleea Câmpului',
                street_number: '12A',
            },
            capacity: 'proprietar',
        };

        const result = redact(party) as Record<string, any>;

        // Structure survives, so a log line still shows which fields were present.
        expect(Object.keys(result)).toEqual(Object.keys(party));
        expect(Object.keys(result.address)).toEqual(Object.keys(party.address));

        // Nothing personal survives.
        expect(result.full_name).toBe('[redacted:10]');
        expect(result.cnp_or_cif).toBe('[redacted:13]');
        expect(result.id_series).toBe('[redacted:2]');
        expect(result.id_number).toBe('[redacted:6]');
        expect(result.phone).toBe('[redacted:12]');
        expect(result.email).toBe('[redacted:16]');
        expect(result.address.county).toBe('[redacted:4]');
        expect(result.address.street).toBe('[redacted:14]');

        // Non-personal fields stay readable — that is the point of not masking everything.
        expect(result.capacity).toBe('proprietar');
        expect(result.is_company).toBe(false);

        expect(JSON.stringify(result)).not.toContain('Ioana');
        expect(JSON.stringify(result)).not.toContain('1234567890123');
    });

    it.each([
        'cnp',
        'cnp_or_cif',
        'cif',
        'id_series',
        'id_number',
        'full_name',
        'first_name',
        'last_name',
        'name',
        'phone',
        'email',
        'address',
        'fiscal_address',
        'street',
        'street_number',
        'city',
        'county',
        'postal_code',
        'village_or_sector',
        'building',
        'staircase',
        'floor',
        'apartment',
        'issued_by',
        'place_of_birth',
        'password',
        'token',
    ])('masks the sensitive key %s', (key) => {
        expect(redact({ [key]: 'sensitive' })).toEqual({ [key]: '[redacted:9]' });
    });

    it.each(['seller_full_name', 'buyer_cnp', 'contact_email', 'home_address', 'mobile_phone'])(
        'masks %s by suffix, so unlisted prefixes are still covered',
        (key) => {
            expect(redact({ [key]: 'sensitive' })).toEqual({ [key]: '[redacted:9]' });
        },
    );

    it('masks everything beneath a sensitive key, however innocuous the inner name looks', () => {
        const result = redact({ address: { notes: 'lângă biserică', depth: { more: 'x' } } }) as any;

        expect(result.address.notes).toBe('[redacted:14]');
        expect(result.address.depth.more).toBe('[redacted:1]');
    });

    it('is case-insensitive about key names', () => {
        expect(redact({ CNP: '1234567890123', Full_Name: 'Ion' })).toEqual({
            CNP: '[redacted:13]',
            Full_Name: '[redacted:3]',
        });
    });

    it('handles cycles without recursing forever', () => {
        const node: any = { cnp: '1234567890123', label: 'root' };
        node.self = node;
        node.children = [{ parent: node, cnp: '9876543210987' }];

        const result = redact(node) as any;

        expect(result.self).toBe('[circular]');
        expect(result.children[0].parent).toBe('[circular]');
        expect(result.children[0].cnp).toBe('[redacted:13]');
        expect(result.label).toBe('root');
    });

    it('renders a shared reference twice rather than calling the second one circular', () => {
        const shared = { city: 'Cluj' };

        const result = redact({ a: shared, b: shared }) as any;

        expect(result.a).toEqual({ city: '[redacted:4]' });
        expect(result.b).toEqual({ city: '[redacted:4]' });
    });

    it.each([
        [null, null],
        [undefined, undefined],
        ['plain string', 'plain string'],
        [42, 42],
        [true, true],
    ])('passes non-sensitive primitive %p through unchanged', (input, expected) => {
        expect(redact(input)).toEqual(expected);
    });

    it('keeps null and undefined visible under sensitive keys, since absence is not personal data', () => {
        expect(redact({ cnp: null, full_name: undefined })).toEqual({ cnp: null, full_name: undefined });
    });

    it('walks arrays, including arrays of parties', () => {
        const result = redact([{ cnp: '1234567890123' }, { cnp: '9876543210987' }]) as any[];

        expect(result).toEqual([{ cnp: '[redacted:13]' }, { cnp: '[redacted:13]' }]);
    });

    it('never dumps a Buffer, which here is usually a photo of an ID card', () => {
        const result = redact({ scan: Buffer.from('pretend this is a JPEG') }) as any;

        expect(result.scan).toBe('[Buffer:22]');
    });

    it('leaves a non-sensitive Date usable and masks one under a sensitive key', () => {
        const date = new Date('2020-01-02T03:04:05.000Z');

        expect((redact({ created_at: date }) as any).created_at).toEqual(date);
        expect((redact({ date_of_birth: date }) as any).date_of_birth).toBe('[redacted:date]');
    });

    it('scrubs an Error down to its name and a redacted message', () => {
        const result = redact({ cause: new TypeError('CNP 1960229123456 was refused') }) as any;

        expect(result.cause.name).toBe('TypeError');
        expect(result.cause.message).toBe('CNP [redacted:cnp] was refused');
    });

    it('handles Maps and Sets', () => {
        const result = redact({
            byKey: new Map([['cnp', '1234567890123']]),
            tags: new Set(['a', 'b']),
        }) as any;

        expect(result.byKey).toEqual({ cnp: '[redacted:13]' });
        expect(result.tags).toEqual(['a', 'b']);
    });

    it('stops at a depth limit instead of walking a pathological structure', () => {
        let deep: any = 'bottom';
        for (let i = 0; i < 40; i++) deep = { nested: deep };

        expect(() => redact(deep)).not.toThrow();
        expect(JSON.stringify(redact(deep))).toContain('[max-depth]');
    });

    it('does not throw when a getter blows up, because it runs on the error path', () => {
        const hostile = {
            get cnp() {
                throw new Error('nope');
            },
        };

        expect(() => redact(hostile)).not.toThrow();
        expect(redact(hostile)).toBe('[redaction-failed]');
    });
});

describe('redactText', () => {
    it('masks a CNP inside a sentence', () => {
        expect(redactText('Validation failed for CNP 1960229123456 at step 3')).toBe(
            'Validation failed for CNP [redacted:cnp] at step 3',
        );
    });

    it('masks several CNPs in one message', () => {
        expect(redactText('seller 1960229123456 buyer 2920101234567')).toBe(
            'seller [redacted:cnp] buyer [redacted:cnp]',
        );
    });

    it('does not mask a longer digit run that merely contains 13 digits', () => {
        const message = 'request 123456789012345678 failed';

        expect(redactText(message)).toBe(message);
    });

    it.each(['XH123456', 'XH 123456', 'XH-123456'])('masks the ID series pattern %s', (id) => {
        expect(redactText(`Document ${id} rejected`)).toBe('Document [redacted:id] rejected');
    });

    it('masks an e-mail address', () => {
        expect(redactText('could not deliver to ioana@example.ro')).toBe('could not deliver to [redacted:email]');
    });

    it('leaves ordinary text alone', () => {
        const message = 'Gemini extraction failed: model overloaded (503)';

        expect(redactText(message)).toBe(message);
    });

    it.each([['', ''], [null as any, ''], [undefined as any, ''], [42 as any, '']])(
        'returns an empty string for the non-string input %p instead of throwing',
        (input, expected) => {
            expect(redactText(input)).toBe(expected);
        },
    );
});
