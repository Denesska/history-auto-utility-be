import { SetMetadata } from '@nestjs/common';

export const SKIP_LEGAL_CONSENT_METADATA_KEY = 'hau:legal:skip';

/**
 * Exempts a controller/handler from LegalEnforcementInterceptor's 403
 * LEGAL_ACCEPTANCE_REQUIRED check. Needed for the few routes a user who hasn't
 * accepted the current terms/privacy policy yet must still be able to call:
 * the legal screen itself (LegalController) and enough of AuthController to
 * log in, refresh, log out, switch context and read `/auth/me` (which is how
 * the frontend learns acceptance is needed in the first place).
 *
 * Usable on a class (exempts every handler) or a single handler
 * (`Reflector.getAllAndOverride` takes the first non-undefined value, handler
 * before class — same mechanism as `@Scope`/`@Feature`).
 */
export const SkipLegalConsent = () => SetMetadata(SKIP_LEGAL_CONSENT_METADATA_KEY, true);
