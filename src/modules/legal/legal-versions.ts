/**
 * Current version tags for the legal texts the user must accept (GDPR terms +
 * privacy policy). Compared against `User.terms_accepted_version` /
 * `User.privacy_accepted_version` (see LegalService / LegalEnforcementInterceptor).
 *
 * Bump these (to a new date, or any string) whenever the texts in the frontend
 * `src/assets/legal/*.html` change materially — every user is then asked to
 * accept again, since their stored accepted version no longer matches.
 */
export const CURRENT_TERMS_VERSION = '2026-10-10';
export const CURRENT_PRIVACY_VERSION = '2026-10-10';
