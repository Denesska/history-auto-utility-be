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
