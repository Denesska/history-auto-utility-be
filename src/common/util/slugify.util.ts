/** Lowercase, ASCII, hyphen-separated version of an organization's name, used to build a company-managed account's synthetic login (`username@slug`). */
export function slugifyCompanyName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'company';
}

export const LOGIN_CODE_REGEX = /^[a-z0-9-]{3,40}$/;

/** Base (before any collision suffix) of an organization's `login_code`: slug of the name, 3-40 chars of [a-z0-9-]. */
export function loginCodeBase(name: string, reserveSuffix = 0): string {
  let slug = slugifyCompanyName(name).slice(0, 40 - reserveSuffix).replace(/-+$/g, '');
  if (slug.length < 3) slug = `${slug}-org`.replace(/^-/, '');
  return slug;
}
