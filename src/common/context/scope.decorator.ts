import { applyDecorators, SetMetadata } from '@nestjs/common';

export type ScopeName = 'personal' | 'business' | 'any';

export interface ScopeOptions {
  /**
   * Business routes normally require `ctx.orgId` to be set. Pass
   * `{ allowNoOrg: true }` for the organization picker / context endpoints
   * that must work right after a business login, before an org is selected.
   */
  allowNoOrg?: boolean;
}

export const SCOPE_METADATA_KEY = 'hau:scope';
export const ALLOW_NO_ORG_METADATA_KEY = 'hau:scope:allow-no-org';

/**
 * Declares which session context(s) a controller/handler belongs to.
 * Usage: `@Scope('personal')`, `@Scope('any')`, `@Scope('personal', 'business')`,
 * `@Scope('business', { allowNoOrg: true })`.
 * Read with `Reflector.getAllAndOverride(SCOPE_METADATA_KEY / ALLOW_NO_ORG_METADATA_KEY, [handler, class])`.
 */
export const Scope = (...args: Array<ScopeName | ScopeOptions>) => {
  const scopes = args.filter((a): a is ScopeName => typeof a === 'string');
  const options = args.find((a): a is ScopeOptions => typeof a === 'object') ?? {};
  return applyDecorators(
    SetMetadata(SCOPE_METADATA_KEY, scopes),
    SetMetadata(ALLOW_NO_ORG_METADATA_KEY, !!options.allowNoOrg),
  );
};
