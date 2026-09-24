import { priceInWords, romanianNumberToWords } from './price-in-words.util';

describe('romanianNumberToWords', () => {
    // The point of the table is the irregulars, not the arithmetic: teens that
    // are not built from their unit (14, 16), tens that are not either (60),
    // and every place where gender changes the word.
    const cases: Array<[number, string]> = [
        [0, 'zero'],
        [1, 'unu'],
        [2, 'doi'],
        [9, 'nouă'],
        [10, 'zece'],
        [11, 'unsprezece'],
        [12, 'doisprezece'],
        [14, 'paisprezece'],
        [16, 'șaisprezece'],
        [19, 'nouăsprezece'],
        [20, 'douăzeci'],
        [21, 'douăzeci și unu'],
        [22, 'douăzeci și doi'],
        [60, 'șaizeci'],
        [99, 'nouăzeci și nouă'],
        [100, 'o sută'],
        [101, 'o sută unu'],
        [112, 'o sută doisprezece'],
        [200, 'două sute'],
        [999, 'nouă sute nouăzeci și nouă'],
        [1000, 'o mie'],
        [1001, 'o mie unu'],
        [2000, 'două mii'],
        [2019, 'două mii nouăsprezece'],
        [19000, 'nouăsprezece mii'],
        [20000, 'douăzeci de mii'],
        [21000, 'douăzeci și una de mii'],
        [22000, 'douăzeci și două de mii'],
        [100000, 'o sută de mii'],
        [1000000, 'un milion'],
        [2000000, 'două milioane'],
        [2750000, 'două milioane șapte sute cincizeci de mii'],
        [20000000, 'douăzeci de milioane'],
        [123456789, 'o sută douăzeci și trei de milioane patru sute cincizeci și șase de mii șapte sute optzeci și nouă'],
    ];

    it.each(cases)('spells %i as "%s"', (input, expected) => {
        expect(romanianNumberToWords(input)).toBe(expected);
    });

    it('uses the feminine forms when the counted noun is feminine', () => {
        // "o mie", "două mii" — not "unu"/"doi", which would be ungrammatical.
        expect(romanianNumberToWords(1, 'feminine')).toBe('una');
        expect(romanianNumberToWords(2, 'feminine')).toBe('două');
        expect(romanianNumberToWords(12, 'feminine')).toBe('douăsprezece');
        expect(romanianNumberToWords(22, 'feminine')).toBe('douăzeci și două');
    });

    it('rejects values it cannot spell rather than guessing', () => {
        expect(() => romanianNumberToWords(-1)).toThrow(RangeError);
        expect(() => romanianNumberToWords(1.5)).toThrow(RangeError);
        expect(() => romanianNumberToWords(Number.NaN)).toThrow(RangeError);
    });
});

describe('priceInWords', () => {
    // The "de" rule is the one most often got wrong by hand, so it gets its own
    // block: 20..99 and anything ending in two zeroes take it, the teens do not.
    const cases: Array<[number, string]> = [
        [0, 'zero lei'],
        [1, 'un leu'],
        [2, 'doi lei'],
        [19, 'nouăsprezece lei'],
        [20, 'douăzeci de lei'],
        [21, 'douăzeci și unu de lei'],
        [100, 'o sută de lei'],
        [101, 'o sută unu lei'],
        [119, 'o sută nouăsprezece lei'],
        [120, 'o sută douăzeci de lei'],
        [200, 'două sute de lei'],
        [1000, 'o mie de lei'],
        [2000, 'două mii de lei'],
        [2019, 'două mii nouăsprezece lei'],
        [21000, 'douăzeci și una de mii de lei'],
        [1000000, 'un milion de lei'],
        [2750000, 'două milioane șapte sute cincizeci de mii de lei'],
    ];

    it.each(cases)('writes %i lei as "%s"', (input, expected) => {
        expect(priceInWords(input)).toBe(expected);
    });

    it('adds the bani only when there are any', () => {
        expect(priceInWords(1250.5)).toBe('o mie două sute cincizeci de lei și cincizeci de bani');
        expect(priceInWords(0.01)).toBe('zero lei și un ban');
        expect(priceInWords(2.02)).toBe('doi lei și doi bani');
        expect(priceInWords(19.19)).toBe('nouăsprezece lei și nouăsprezece bani');
        expect(priceInWords(1000)).toBe('o mie de lei');
    });

    it('rounds to the ban without losing one to float arithmetic', () => {
        // 8.115 * 100 is 811.4999... in IEEE 754; scaling before rounding keeps
        // the ban that a naive (value % 1) * 100 would drop.
        expect(priceInWords(8.115)).toBe('opt lei și doisprezece bani');
        expect(priceInWords(0.1 + 0.2)).toBe('zero lei și treizeci de bani');
    });

    it('refuses amounts it cannot spell', () => {
        expect(() => priceInWords(-5)).toThrow(RangeError);
        expect(() => priceInWords(1_000_000_000)).toThrow(RangeError);
    });
});
