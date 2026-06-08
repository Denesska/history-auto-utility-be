export const WEB_ORIGINS = [
  'https://app.denhau.ro',
  'https://dev.denhau.ro',
  'http://localhost:4200',
] as const;

export const MOBILE_ORIGINS = [
  'https://localhost',
  'capacitor://localhost',
] as const;

export const ALLOWED_LOGIN_ORIGINS = [...WEB_ORIGINS, ...MOBILE_ORIGINS] as const;

export function isMobileLoginOrigin(origin: string | undefined): boolean {
  return !!origin && (MOBILE_ORIGINS as readonly string[]).includes(origin);
}
