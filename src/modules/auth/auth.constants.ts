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

// Generic password assigned to every company-created account at creation and
// on every password reset — shown once to the Director/Owner/Fleet Admin who
// created or reset it, never emailed. The account can't do anything useful
// until it logs in with this and sets its own (see must_change_password).
export const DEFAULT_COMPANY_PASSWORD = 'ChangeMe123!';

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

// Policy flag for POST /auth/context: a personal session may not jump into a
// business context without logging in on the Business tab. Flip to true to
// enable the "link personal and business" feature — see ACCOUNT-CONTEXT.md,
// section "Future: linking personal and business (merge)".
export const ALLOW_PERSONAL_BUSINESS_SWITCH = false;
