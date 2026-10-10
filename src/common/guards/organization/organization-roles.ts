import { OrganizationRole } from '@prisma/client';

/**
 * The organization role ladder. Rank 0 outranks everyone; a higher number is
 * strictly weaker. FLEET_ADMIN/FINANCE/MANAGER share a rank — they're peers,
 * not ranked against each other (MANAGER is disabled, see schema.prisma).
 */
export const ORG_ROLE_RANK: Record<OrganizationRole, number> = {
  OWNER: 0,
  SUPER_ADMIN: 1,
  FLEET_ADMIN: 2,
  FINANCE: 2,
  MANAGER: 2,
  DRIVER: 3,
};

/**
 * Which roles each role may invite or assign via the app. OWNER never
 * appears as a value here — it's assigned directly in the database when a
 * business account is sold, never through the invite/change-role endpoints.
 * SUPER_ADMIN (Director) is only assignable by OWNER — Directors can't
 * create other Directors.
 */
export const INVITABLE_ROLES: Record<OrganizationRole, OrganizationRole[]> = {
  OWNER: [OrganizationRole.SUPER_ADMIN, OrganizationRole.FLEET_ADMIN, OrganizationRole.FINANCE, OrganizationRole.DRIVER],
  SUPER_ADMIN: [OrganizationRole.FLEET_ADMIN, OrganizationRole.FINANCE, OrganizationRole.DRIVER],
  FLEET_ADMIN: [OrganizationRole.DRIVER],
  FINANCE: [],
  MANAGER: [],
  DRIVER: [],
};

export function canAssignRole(actorRole: OrganizationRole, targetRole: OrganizationRole): boolean {
  return INVITABLE_ROLES[actorRole].includes(targetRole);
}

/**
 * Whether `actor` may change the role of, or remove, a member currently
 * holding `targetRole`. OWNER is untouchable by anyone through the app.
 * SUPER_ADMIN (Director) peers can see each other but can't manage one
 * another — only OWNER can. A FLEET_ADMIN may only manage the DRIVERs they
 * personally invited (their own fleet), nothing else.
 */
export function canManageMember(
  actorRole: OrganizationRole,
  actorUserId: number,
  target: { role: OrganizationRole; invited_by_user_id: number | null },
): boolean {
  if (target.role === OrganizationRole.OWNER) return false;
  if (actorRole === OrganizationRole.OWNER) return true;
  if (target.role === OrganizationRole.SUPER_ADMIN) return false;
  if (actorRole === OrganizationRole.SUPER_ADMIN) return true;
  if (actorRole === OrganizationRole.FLEET_ADMIN && target.role === OrganizationRole.DRIVER) {
    return target.invited_by_user_id === actorUserId;
  }
  return false;
}

/**
 * Whether `actor` may see a given member in the organization's list — "sees
 * everything below them, never above" (plus: Directors see every other
 * Director, just can't manage them; a FLEET_ADMIN only sees the Director who
 * invited them and the DRIVERs they personally manage; a DRIVER sees no one
 * but themself, which is why the Organization screen is hidden for them
 * entirely on the frontend).
 */
export function canSeeMember(
  actor: { role: OrganizationRole; user_id: number; invited_by_user_id: number | null },
  target: { role: OrganizationRole; user_id: number; invited_by_user_id: number | null },
): boolean {
  if (target.user_id === actor.user_id) return true;
  if (actor.role === OrganizationRole.OWNER || actor.role === OrganizationRole.SUPER_ADMIN) return true;
  if (actor.role === OrganizationRole.FLEET_ADMIN) {
    if (target.user_id === actor.invited_by_user_id) return true;
    return target.role === OrganizationRole.DRIVER && target.invited_by_user_id === actor.user_id;
  }
  if (actor.role === OrganizationRole.FINANCE || actor.role === OrganizationRole.MANAGER) {
    return target.user_id === actor.invited_by_user_id;
  }
  return false;
}
