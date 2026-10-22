import { SessionContext } from '../../../common/context/session-context';

export interface JwtUserPayload {
  id?: number;
  google_id: string;
  email: string;
  /** Surfaced on `/auth/me` so the frontend can force the password-change screen right after a local login. Absent on a Google-identity account. */
  must_change_password?: boolean;
  is_company_managed?: boolean;
  /** GDPR acceptance state, loaded fresh from the DB on every request by JwtStrategy — see LegalEnforcementInterceptor / LegalService. */
  terms_accepted_version?: string | null;
  privacy_accepted_version?: string | null;
  legal_accepted_at?: Date | null;
  /** Personal/business session context carried in the JWT (see ACCOUNT-CONTEXT.md). Always set after validation; personal for pre-context tokens. */
  ctx?: SessionContext;
}
