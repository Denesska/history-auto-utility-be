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

// Fixed identity for the dev-only login bypass (see AuthController#devLogin).
// Deliberately distinct from any real Google account so it can never collide
// with the real family accounts seeded in hau_db_dev.
export const DEV_BYPASS_USER = {
  google_id: 'dev-bypass-user',
  email: 'dev-bypass@local.test',
  first_name: 'Dev',
  last_name: 'Bypass',
  picture: '',
} as const;
