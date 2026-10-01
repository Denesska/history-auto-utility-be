import { SetMetadata } from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';

export const REQUIRED_ORG_ROLE_KEY = 'requiredOrgRole';

/**
 * Unlike `@RequiredCarRole`, organization roles aren't a linear hierarchy
 * (FLEET_ADMIN/MANAGER/DRIVER/FINANCE are different functional scopes, not
 * ranked levels) — so this only supports two checks: no decorator at all
 * (any accepted member may call the route), or `SUPER_ADMIN` (membership
 * management and feature-flag toggles). See OrganizationGuard.
 */
export const RequiredOrgRole = (role: OrganizationRole) => SetMetadata(REQUIRED_ORG_ROLE_KEY, role);
