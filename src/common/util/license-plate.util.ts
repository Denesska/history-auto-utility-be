/**
 * Formats a license plate the same way the frontend's live input does
 * (`shared/utils/license-plate.util.ts` on the FE): uppercase, letters and
 * digits only (any separator collapses to a single space), with a space
 * inserted at every letter<->digit boundary that doesn't already have one.
 * "bv95hau" -> "BV 95 HAU", "B-AB 1234" -> "B AB 1234". Applied on
 * create/update/import so stored values are consistent going forward —
 * existing rows saved before this were never rewritten, so they can still be
 * in other shapes; use `normalizePlateForComparison` whenever comparing
 * against a plate that might be one of those.
 */
export function formatLicensePlate(value: string | null | undefined): string {
  if (!value) return '';

  const isAlnum = (ch: string): boolean => /[\p{L}0-9]/u.test(ch);

  let result = Array.from(value.toUpperCase())
    .map((ch) => (isAlnum(ch) ? ch : ' '))
    .join('');

  result = result
    .replace(/(\p{L})(?=[0-9])/gu, '$1 ')
    .replace(/([0-9])(?=\p{L})/gu, '$1 ');

  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Collapses a plate down to uppercase ASCII letters/digits only, dropping
 * every separator — the form two plates are compared in so "BV95HAU" and
 * "BV 95 HAU" (or any other legacy spacing) are recognized as the same
 * plate. ASCII-only so it matches the `REGEXP_REPLACE(..., '[^A-Za-z0-9]', ...)`
 * used on the DB side for the same comparison (see car.service.ts). Never
 * stored, comparison-only.
 */
export function normalizePlateForComparison(value: string | null | undefined): string {
  if (!value) return '';
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
