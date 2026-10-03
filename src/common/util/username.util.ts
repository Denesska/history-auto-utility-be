/** Format of a company-managed account's login username: lowercase letters and digits, 3-20 chars. */
export const USERNAME_REGEX = /^[a-z0-9]{3,20}$/;

/** Words dropped from an organization name when building its initials (legal forms). */
const LEGAL_SUFFIXES = new Set(['srl', 'sa', 'sra', 'snc', 'scs', 'pfa', 'ii', 'llc', 'ltd', 'gmbh', 'inc', 'co', 'corp']);

/** Lowercase, diacritics stripped, a-z only (spaces, hyphens, digits dropped): "Ștefan" -> "stefan". */
function lettersOnly(value: string): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/**
 * First 5 letters of the last name + first 2 of the first name
 * (Denis Gandzii -> "gandzde", Ana Ion -> "ionan"). A single name alone gives
 * its first 7 letters; the result is padded to at least 3 chars.
 */
export function baseUsername(firstName: string, lastName: string): string {
  const first = lettersOnly(firstName);
  const last = lettersOnly(lastName);
  let base: string;
  if (!first || !last) {
    base = (first || last).slice(0, 7);
  } else {
    base = last.slice(0, 5) + first.slice(0, 2);
    // Very short names ("Li" + "A"): top up from the rest of the names.
    if (base.length < 3) base += (first.slice(2) + last.slice(5)).slice(0, 3 - base.length);
  }
  if (!base) base = 'user';
  return base.padEnd(3, '0');
}

/** First letter of each of the first 3 significant words of an org name, legal suffixes ignored ("Denhau Solutions SRL" -> "ds"). */
export function orgInitials(orgName: string): string {
  const words = (orgName ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w && !LEGAL_SUFFIXES.has(w));
  return words
    .slice(0, 3)
    .map(w => w[0])
    .join('');
}

/**
 * Candidates in order of preference: base, base+initials, base+2, base+3, ...
 * Lazy and infinite — the caller takes the first one that is free.
 */
export function* usernameCandidates(firstName: string, lastName: string, orgName: string): Generator<string> {
  const base = baseUsername(firstName, lastName);
  yield base;
  const initials = orgInitials(orgName);
  if (initials) yield base + initials;
  for (let n = 2; ; n++) yield base + n;
}

/** First free username for the person; `isTaken` is the DB-aware (global) uniqueness check. */
export async function generateUniqueUsername(
  firstName: string,
  lastName: string,
  orgName: string,
  isTaken: (username: string) => Promise<boolean>,
): Promise<string> {
  for (const candidate of usernameCandidates(firstName, lastName, orgName)) {
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error('unreachable');
}
