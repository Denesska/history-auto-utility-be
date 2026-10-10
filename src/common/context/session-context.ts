import { OrganizationRole } from '@prisma/client';

/**
 * Which environment a session lives in, chosen at login and carried in the JWT
 * (`ctx` claim, access + refresh). See ACCOUNT-CONTEXT.md.
 * `orgId: null` = business login done, organization not picked yet.
 */
export type SessionContext =
  | { type: 'personal' }
  | { type: 'business'; orgId: number | null; orgRole?: OrganizationRole };

export const DEFAULT_SESSION_CONTEXT: SessionContext = { type: 'personal' };

/** Defensive parse of a `ctx` claim from a token — anything malformed (or absent, for tokens issued before contexts existed) falls back to personal. */
export function parseSessionContext(raw: unknown): SessionContext {
  const ctx = raw as any;
  if (ctx?.type === 'business') {
    return {
      type: 'business',
      orgId: typeof ctx.orgId === 'number' ? ctx.orgId : null,
      ...(ctx.orgRole ? { orgRole: ctx.orgRole as OrganizationRole } : {}),
    };
  }
  return { type: 'personal' };
}
