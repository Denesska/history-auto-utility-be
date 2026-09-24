import { describeCnpProblem, isValidCnp } from './cnp.util';

/**
 * Builds a syntactically valid CNP from its first twelve digits by appending the correct
 * control digit.
 *
 * The weights are written out again here rather than imported: a test that asks the
 * implementation what the right answer is cannot detect the implementation being wrong. This
 * also means no real person's CNP ever enters the repository — every fixture below is a
 * synthetic number assembled from a chosen date and county.
 */
function withControlDigit(first12: string): string {
    const weights = '279146358279';
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += Number(first12[i]) * Number(weights[i]);
    }
    const remainder = sum % 11;
    return first12 + String(remainder === 10 ? 1 : remainder);
}

/** Replaces the control digit with a different one — any other digit must fail. */
function breakControlDigit(cnp: string): string {
    const wrong = (Number(cnp[12]) + 1) % 10;
    return cnp.slice(0, 12) + String(wrong);
}

//                        S  YYMMDD  JJ  NNN
const MALE_1990 = withControlDigit('1' + '900101' + '01' + '234');
const FEMALE_1985 = withControlDigit('2' + '851231' + '40' + '015');
const BORN_2004_LEAP_DAY = withControlDigit('5' + '040229' + '52' + '007');
const FOREIGN_RESIDENT = withControlDigit('7' + '751120' + '70' + '099');
const BORN_1880 = withControlDigit('3' + '800615' + '10' + '003');

describe('isValidCnp', () => {
    it.each([
        ['a man born in 1990', MALE_1990],
        ['a woman born in 1985', FEMALE_1985],
        ['someone born on a leap day in 2004', BORN_2004_LEAP_DAY],
        ['a foreign resident, county code 70', FOREIGN_RESIDENT],
        ['a 19th-century birth date', BORN_1880],
    ])('accepts %s', (_label, cnp) => {
        expect(cnp).toHaveLength(13);
        expect(isValidCnp(cnp)).toBe(true);
    });

    it('accepts a value with surrounding whitespace, which is a paste artefact', () => {
        expect(isValidCnp(`  ${MALE_1990}  `)).toBe(true);
    });

    it.each([
        ['a wrong control digit', breakControlDigit(MALE_1990)],
        ['only 12 digits', MALE_1990.slice(0, 12)],
        ['14 digits', MALE_1990 + '5'],
        ['letters', 'ABCDEFGHIJKLM'],
        ['a digit replaced by a letter', MALE_1990.slice(0, 12) + 'X'],
        ['an interior space', MALE_1990.slice(0, 6) + ' ' + MALE_1990.slice(7)],
        ['month 13', withControlDigit('1' + '901301' + '01' + '234')],
        ['30 February', withControlDigit('1' + '900230' + '01' + '234')],
        ['day 00', withControlDigit('1' + '900100' + '01' + '234')],
        ['a birth date in the future', withControlDigit('5' + '990101' + '01' + '234')],
        ['a leading 0, which is not an assigned marker', withControlDigit('0' + '900101' + '01' + '234')],
        ['county code 99', withControlDigit('1' + '900101' + '99' + '234')],
        ['county code 00', withControlDigit('1' + '900101' + '00' + '234')],
        ['county code 53', withControlDigit('1' + '900101' + '53' + '234')],
        ['an empty string', ''],
        ['whitespace only', '   '],
    ])('rejects %s', (_label, cnp) => {
        expect(isValidCnp(cnp)).toBe(false);
    });

    it('rejects every single-digit substitution in a valid CNP, which is the OCR failure mode', () => {
        // The point of the checksum: an AI misreading one digit off a photographed ID card
        // must not produce a CNP that passes validation.
        //
        // This holds for every single-digit substitution because 11 is prime and no weight or
        // digit delta is divisible by it. The one structural blind spot in the standard is that
        // remainders 1 and 10 both map to control digit 1, so a CNP whose control digit is 1 has
        // substitutions it cannot catch — hence a fixture whose control digit is 9.
        let caught = 0;
        let total = 0;

        for (let position = 0; position < 13; position++) {
            for (let digit = 0; digit <= 9; digit++) {
                if (String(digit) === MALE_1990[position]) continue;
                total++;
                const mutated = MALE_1990.slice(0, position) + digit + MALE_1990.slice(position + 1);
                if (!isValidCnp(mutated)) caught++;
            }
        }

        expect(total).toBe(117);
        expect(caught).toBe(total);
    });

    it('rejects a non-string input rather than throwing', () => {
        expect(isValidCnp(undefined as any)).toBe(false);
        expect(isValidCnp(null as any)).toBe(false);
        expect(isValidCnp(1234567890123 as any)).toBe(false);
    });
});

describe('describeCnpProblem', () => {
    it('returns null for a valid CNP', () => {
        expect(describeCnpProblem(MALE_1990)).toBeNull();
    });

    it.each([
        ['', /Completează/],
        ['ABCDEFGHIJKLM', /doar cifre/],
        [MALE_1990.slice(0, 12), /13 cifre/],
        [withControlDigit('1' + '901301' + '01' + '234'), /Data nașterii/],
        [withControlDigit('1' + '900101' + '99' + '234'), /județ/],
        [withControlDigit('0' + '900101' + '01' + '234'), /cifră validă/],
        [breakControlDigit(MALE_1990), /cifră greșită/],
    ])('explains what is wrong with %p', (cnp, expected) => {
        expect(describeCnpProblem(cnp)).toMatch(expected);
    });

    it('names the most visible problem first, so the message is actionable', () => {
        // A 12-digit value also fails the checksum, but "it needs 13 digits" is what the user
        // can actually see and fix.
        expect(describeCnpProblem(MALE_1990.slice(0, 12))).toMatch(/13 cifre/);
    });

    it('stays short and non-accusatory — it is shown as a form warning', () => {
        const messages = [
            describeCnpProblem(''),
            describeCnpProblem('ABCDEFGHIJKLM'),
            describeCnpProblem(breakControlDigit(MALE_1990)),
        ];

        for (const message of messages) {
            expect(message.length).toBeLessThanOrEqual(70);
            expect(message).not.toMatch(/invalid|eroare|greșit de tine/i);
        }
    });

    it('never echoes the CNP back into the message', () => {
        expect(describeCnpProblem(breakControlDigit(MALE_1990))).not.toContain(MALE_1990.slice(0, 6));
    });
});
