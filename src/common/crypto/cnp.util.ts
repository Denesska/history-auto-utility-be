/**
 * Romanian CNP ("cod numeric personal") validation.
 *
 * This is a correctness control, not tidiness. The CNP reaches us by way of an AI model reading
 * a photograph of an identity card: thirteen digits, no redundancy visible to a human skimming
 * a form, and a single misread digit produces a sale-purchase contract that looks perfectly
 * fine on screen and is rejected at the counter. The official control digit catches essentially
 * every single-digit substitution and most transpositions, which is exactly the error profile
 * of OCR. Validating here is the difference between a warning in the form and a wasted trip.
 *
 * Nothing in this file logs. A CNP is personal data; see redact.util.ts before it goes anywhere.
 */

/**
 * The constant weights defined by the CNP standard, applied to the first twelve digits.
 * Not a checksum of our own devising — this exact string is the specification.
 */
const CONTROL_KEY = '279146358279';

const CNP_LENGTH = 13;

/**
 * First digit encodes sex and birth century.
 *   1/2 → 1900-1999, 3/4 → 1800-1899, 5/6 → 2000-2099.
 *   7/8 → foreign resident, 9 → foreign person: the standard does not pin a century for these,
 *         so both plausible ones are tried and the CNP is accepted if either yields a real date.
 * 0 is not assigned.
 */
const CENTURY_BY_FIRST_DIGIT: Record<string, number[]> = {
    '1': [1900],
    '2': [1900],
    '3': [1800],
    '4': [1800],
    '5': [2000],
    '6': [2000],
    '7': [1900, 2000],
    '8': [1900, 2000],
    '9': [1900, 2000],
};

/** Counties are 01-52 (41 judeţe, 6 Bucharest sectors, plus the codes added when sectors were
 *  renumbered); 70 is reserved for foreigners holding Romanian residence. */
const MIN_COUNTY_CODE = 1;
const MAX_COUNTY_CODE = 52;
const FOREIGN_RESIDENT_COUNTY_CODE = 70;

/** Discriminated reasons, so `isValidCnp` and `describeCnpProblem` share one implementation and
 *  can never disagree about whether a given CNP is acceptable. */
type CnpProblem = 'empty' | 'length' | 'non_digits' | 'first_digit' | 'date' | 'county' | 'checksum';

/**
 * End-user facing, in Romanian, shown as a form warning next to the field.
 *
 * Wording is deliberately short and non-accusatory — in the common case the user typed nothing
 * wrong at all, the AI misread their ID card, so the messages point at the value rather than at
 * the person and suggest checking the document.
 */
const PROBLEM_MESSAGES: Record<CnpProblem, string> = {
    empty: 'Completează CNP-ul.',
    length: 'CNP-ul trebuie să aibă 13 cifre.',
    non_digits: 'CNP-ul trebuie să conțină doar cifre.',
    first_digit: 'CNP-ul nu începe cu o cifră validă. Mai verifică-l o dată.',
    date: 'Data nașterii din CNP nu pare corectă. Verifică cifrele 2-7.',
    county: 'Codul de județ din CNP nu pare corect. Verifică cifrele 8-9.',
    checksum: 'CNP-ul pare să aibă o cifră greșită. Mai verifică-l o dată.',
};

/**
 * True when `cnp` is a well-formed Romanian CNP: thirteen digits, a valid century marker, a
 * real date of birth that is not in the future, a plausible county code, and a matching
 * control digit.
 */
export function isValidCnp(cnp: string): boolean {
    return findProblem(cnp) === null;
}

/**
 * A short Romanian explanation of what is wrong with `cnp`, or null when it is valid.
 *
 * Checks run cheapest-and-most-obvious first so the message names the thing a user can actually
 * see — "it has 12 digits" is more useful than "the checksum failed", even though a 12-digit
 * value also fails the checksum.
 */
export function describeCnpProblem(cnp: string): string | null {
    const problem = findProblem(cnp);
    return problem === null ? null : PROBLEM_MESSAGES[problem];
}

function findProblem(cnp: string): CnpProblem | null {
    if (typeof cnp !== 'string') return 'empty';

    // Surrounding whitespace is a paste artefact, not a mistake worth reporting. Separators
    // inside the number are not stripped: a CNP is never written in groups, so an interior
    // space is a sign the value is something else entirely.
    const value = cnp.trim();

    if (value.length === 0) return 'empty';
    if (!/^\d+$/.test(value)) return 'non_digits';
    if (value.length !== CNP_LENGTH) return 'length';

    const centuries = CENTURY_BY_FIRST_DIGIT[value[0]];
    if (!centuries) return 'first_digit';

    const yearInCentury = Number(value.slice(1, 3));
    const month = Number(value.slice(3, 5));
    const day = Number(value.slice(5, 7));
    if (!centuries.some((century) => isRealPastDate(century + yearInCentury, month, day))) {
        return 'date';
    }

    const county = Number(value.slice(7, 9));
    const countyValid =
        (county >= MIN_COUNTY_CODE && county <= MAX_COUNTY_CODE) || county === FOREIGN_RESIDENT_COUNTY_CODE;
    if (!countyValid) return 'county';

    if (computeControlDigit(value) !== Number(value[CNP_LENGTH - 1])) return 'checksum';

    return null;
}

/**
 * The official algorithm: each of the first twelve digits is multiplied by the digit in the
 * same position of CONTROL_KEY, the products are summed, and the remainder modulo 11 is the
 * control digit — except that a remainder of 10 maps to 1, because the field holds one digit.
 */
function computeControlDigit(cnp: string): number {
    let sum = 0;
    for (let i = 0; i < CONTROL_KEY.length; i++) {
        sum += Number(cnp[i]) * Number(CONTROL_KEY[i]);
    }
    const remainder = sum % 11;
    return remainder === 10 ? 1 : remainder;
}

/**
 * Rejects both calendar-impossible dates (31 February, month 13) and dates in the future.
 *
 * The future check matters more than it looks: with a 2000s century marker an OCR slip in the
 * year digits produces something like 2099, which is a perfectly real calendar date and would
 * otherwise sail through.
 */
function isRealPastDate(year: number, month: number, day: number): boolean {
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;

    const date = new Date(Date.UTC(year, month - 1, day));
    const isRealCalendarDate =
        date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;

    return isRealCalendarDate && date.getTime() <= Date.now();
}
