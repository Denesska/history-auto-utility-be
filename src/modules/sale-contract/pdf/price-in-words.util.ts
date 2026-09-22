/**
 * Romanian number-to-words, for the contract's «PREŢUL în cifre ... lei, în
 * litere ...» blank.
 *
 * The written-out price is the legally operative one when it disagrees with the
 * figure, so this has to be right rather than merely readable. Romanian makes
 * that harder than English in three ways, all handled below:
 *
 *  1. **Gender.** 1 and 2 (and 12) inflect with the noun they count:
 *     "doi lei" but "două mii", "un milion" but "o mie". `mie/mii` is feminine,
 *     `leu/lei`, `ban/bani` and `milion/milioane` take the masculine/neuter
 *     forms — except that neuter plurals agree like feminines, which is why
 *     "două milioane" is correct and "doi milioane" is not.
 *
 *  2. **The "de" rule.** A numeral whose last two digits are 0 or 20..99 links
 *     to its noun with "de": "douăzeci **de** lei", "o sută **de** lei",
 *     "o mie **de** lei" — but "nouăsprezece lei" and "o sută unu lei" take
 *     none. The same rule applies again *inside* the number, between a group
 *     and its scale word: "douăzeci **de** mii", "o sută **de** mii".
 *
 *  3. **Irregular teens and tens.** 14 is "paisprezece" (not *patrusprezece*)
 *     and 60 is "șaizeci" (not *șasezeci*).
 *
 * Diacritics use the comma-below forms (ș U+0219, ț U+021B), which is the
 * correct modern orthography and what DejaVu Serif renders in the PDF.
 */

/** Which agreement the counted noun forces on the numbers 1, 2 and 12. */
export type RoGender = 'masculine' | 'feminine';

const UNITS: Record<RoGender, string[]> = {
    masculine: ['', 'unu', 'doi', 'trei', 'patru', 'cinci', 'șase', 'șapte', 'opt', 'nouă'],
    feminine: ['', 'una', 'două', 'trei', 'patru', 'cinci', 'șase', 'șapte', 'opt', 'nouă'],
};

const TEENS: Record<RoGender, string[]> = {
    masculine: [
        'zece',
        'unsprezece',
        'doisprezece',
        'treisprezece',
        'paisprezece',
        'cincisprezece',
        'șaisprezece',
        'șaptesprezece',
        'optsprezece',
        'nouăsprezece',
    ],
    feminine: [
        'zece',
        'unsprezece',
        'douăsprezece',
        'treisprezece',
        'paisprezece',
        'cincisprezece',
        'șaisprezece',
        'șaptesprezece',
        'optsprezece',
        'nouăsprezece',
    ],
};

const TENS = ['', '', 'douăzeci', 'treizeci', 'patruzeci', 'cincizeci', 'șaizeci', 'șaptezeci', 'optzeci', 'nouăzeci'];

/** Largest amount we will spell out. Beyond this the figure alone must stand;
 *  silently emitting a wrong or truncated wording on a contract is worse. */
const MAX_LEI = 999_999_999;

/**
 * True when a numeral must be linked to what it counts by "de".
 * Applies both to the noun ("... de lei") and to scale words ("... de mii").
 */
function needsDe(n: number): boolean {
    if (n < 20) return false;
    const lastTwo = n % 100;
    return lastTwo === 0 || lastTwo >= 20;
}

/** 1..99. Returns '' for 0 so callers can skip empty groups. */
function belowHundred(n: number, gender: RoGender): string {
    if (n === 0) return '';
    if (n < 10) return UNITS[gender][n];
    if (n < 20) return TEENS[gender][n - 10];
    const tens = TENS[Math.floor(n / 10)];
    const unit = n % 10;
    return unit === 0 ? tens : `${tens} și ${UNITS[gender][unit]}`;
}

/** 1..999. The hundreds themselves always agree as feminine ("două sute"). */
function belowThousand(n: number, gender: RoGender): string {
    if (n === 0) return '';
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    const parts: string[] = [];
    if (hundreds === 1) parts.push('o sută');
    else if (hundreds === 2) parts.push('două sute');
    else if (hundreds > 2) parts.push(`${UNITS.feminine[hundreds]} sute`);
    if (rest > 0) parts.push(belowHundred(rest, gender));
    return parts.join(' ');
}

/** "două milioane" / "douăzeci de mii" — a group plus its scale word. */
function scaled(group: number, singular: string, plural: string, singularArticle: string, gender: RoGender): string {
    if (group === 1) return `${singularArticle} ${singular}`;
    const words = belowThousand(group, gender);
    return needsDe(group) ? `${words} de ${plural}` : `${words} ${plural}`;
}

/**
 * Spells out a non-negative integer. `gender` is that of the noun the number
 * will be read with, and only affects the final 1/2/12 — "douăzeci și una de
 * mii" vs "douăzeci și unu de lei".
 */
export function romanianNumberToWords(n: number, gender: RoGender = 'masculine'): string {
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        throw new RangeError(`romanianNumberToWords expects a non-negative integer, got ${n}`);
    }
    if (n === 0) return 'zero';

    const millions = Math.floor(n / 1_000_000);
    const thousands = Math.floor((n % 1_000_000) / 1000);
    const rest = n % 1000;

    const parts: string[] = [];
    // "milion" is neuter: singular takes "un", plural agrees like a feminine.
    if (millions > 0) parts.push(scaled(millions, 'milion', 'milioane', 'un', 'feminine'));
    // "mie" is feminine throughout: "o mie", "două mii", "douăzeci și una de mii".
    if (thousands > 0) parts.push(scaled(thousands, 'mie', 'mii', 'o', 'feminine'));
    if (rest > 0) parts.push(belowThousand(rest, gender));

    return parts.join(' ');
}

/**
 * Spells out a number as an amount of a given noun, inserting "de" when the
 * grammar calls for it: `spellAmount(20, 'leu', 'lei')` → "douăzeci de lei".
 */
function spellAmount(n: number, singular: string, plural: string, gender: RoGender): string {
    // A bare 1 takes the article form, not the counting form: "un leu", never
    // "unu leu" — while inside a compound it stays "douăzeci și unu de lei".
    if (n === 1) return `${gender === 'feminine' ? 'o' : 'un'} ${singular}`;
    const words = romanianNumberToWords(n, gender);
    return needsDe(n) ? `${words} de ${plural}` : `${words} ${plural}`;
}

/**
 * The value for the contract's "în litere" blank.
 *
 * Bani are only mentioned when there are any — Romanian contracts write
 * "o mie de lei", not "o mie de lei și zero bani". Rounds to the ban, because
 * that is the smallest amount the figure beside it can express.
 */
export function priceInWords(amountLei: number): string {
    if (!Number.isFinite(amountLei) || amountLei < 0) {
        throw new RangeError(`priceInWords expects a non-negative amount, got ${amountLei}`);
    }
    // Scale first, then round: 0.1 + 0.2 arithmetic must not lose a ban.
    const totalBani = Math.round(amountLei * 100);
    const lei = Math.floor(totalBani / 100);
    const bani = totalBani % 100;

    if (lei > MAX_LEI) {
        throw new RangeError(`priceInWords supports amounts up to ${MAX_LEI} lei, got ${lei}`);
    }

    const leiWords = spellAmount(lei, 'leu', 'lei', 'masculine');
    if (bani === 0) return leiWords;
    return `${leiWords} și ${spellAmount(bani, 'ban', 'bani', 'masculine')}`;
}
