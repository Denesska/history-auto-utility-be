import { SetMetadata } from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';

export const REQUIRED_ORG_ROLE_KEY = 'requiredOrgRole';

/**
 * Gates a route to an accepted member ranked at `role` or higher in the
 * organization ladder (`organization-roles.ts`'s `ORG_ROLE_RANK`) — e.g.
 * `@RequiredOrgRole(SUPER_ADMIN)` admits SUPER_ADMIN (Director) or OWNER.
 * No decorator at all means any accepted member may call the route. Finer
 * invite/manage rules that depend on *who* the target is (not just the
 * actor's own rank — "FLEET_ADMIN may only manage DRIVERs they personally
 * invited") aren't expressible here and live as inline checks in
 * `OrganizationService` instead. See OrganizationGuard.
 */
export const RequiredOrgRole = (role: OrganizationRole) => SetMetadata(REQUIRED_ORG_ROLE_KEY, role);
