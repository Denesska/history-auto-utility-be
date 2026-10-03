import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionContext } from '../context/session-context';
import { FEATURE_KEYS, FeatureKey } from './feature-keys';

const CACHE_TTL_MS = 60_000;

/**
 * Resolves which feature switches are on for a session context.
 * Personal sessions: always everything (@Scope already governs them).
 * Business sessions: every key is on unless the org's `feature_flags` JSON has it set to `false`.
 */
@Injectable()
export class FeatureAccessService {
  private readonly cache = new Map<number, { disabled: Set<FeatureKey>; expires: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async enabledFeatures(ctx: SessionContext): Promise<FeatureKey[]> {
    if (ctx.type !== 'business' || ctx.orgId == null) return [...FEATURE_KEYS];
    const disabled = await this.disabledFor(ctx.orgId);
    return FEATURE_KEYS.filter(k => !disabled.has(k));
  }

  async isEnabled(ctx: SessionContext, key: FeatureKey): Promise<boolean> {
    return (await this.enabledFeatures(ctx)).includes(key);
  }

  /** Drop the cached flags of an organization (call after changing its feature_flags). */
  invalidate(orgId: number): void {
    this.cache.delete(orgId);
  }

  /**
   * Organization ids with `key` explicitly disabled — for batch jobs (e.g. cron reminders)
   * that need to skip many rows up front instead of calling `isEnabled` per row. One query
   * for the whole run; independent of the per-session cache above.
   */
  async disabledOrgIds(key: FeatureKey): Promise<Set<number>> {
    const orgs = await this.prisma.organization.findMany({ select: { id: true, feature_flags: true } });
    const disabled = new Set<number>();
    for (const org of orgs) {
      const flags = org.feature_flags;
      if (flags && typeof flags === 'object' && !Array.isArray(flags) && (flags as Record<string, unknown>)[key] === false) {
        disabled.add(org.id);
      }
    }
    return disabled;
  }

  private async disabledFor(orgId: number): Promise<Set<FeatureKey>> {
    const hit = this.cache.get(orgId);
    if (hit && hit.expires > Date.now()) return hit.disabled;

    // Plan-based defaults (Organization.plan) will plug in here.
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { feature_flags: true } });
    const flags = org?.feature_flags;
    const disabled = new Set<FeatureKey>();
    if (flags && typeof flags === 'object' && !Array.isArray(flags)) {
      for (const key of FEATURE_KEYS) {
        if ((flags as Record<string, unknown>)[key] === false) disabled.add(key);
      }
    }
    this.cache.set(orgId, { disabled, expires: Date.now() + CACHE_TTL_MS });
    return disabled;
  }
}
