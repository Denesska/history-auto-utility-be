import { SetMetadata } from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';

export const BUSINESS_ROLES_METADATA_KEY = 'hau:business-roles';

/**
 * Restricts a route to the given organization roles WHEN the session is in
 * business context (personal sessions are unaffected). Enforced by the
 * ContextEnforcementInterceptor against the freshly loaded membership role;
 * a non-matching role gets 403 `{ code: 'ROLE_NOT_ALLOWED' }`.
 */
export const BusinessRoles = (...roles: OrganizationRole[]) => SetMetadata(BUSINESS_ROLES_METADATA_KEY, roles);
