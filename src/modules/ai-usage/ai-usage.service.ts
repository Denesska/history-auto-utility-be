import { HttpException, Injectable, Logger } from '@nestjs/common';
import { AiSettings, NotificationType, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiBlockReason, AiFeature, AiProvider, AiUsageStatus } from './ai-features';
import { estimateCostUsd } from './ai-pricing';
import { startOfDay, startOfMonth, startOfNextDay, startOfNextMonth } from './ai-time';

export type QuotaBlocked = { allowed: false; reason: AiBlockReason; retryAt: Date | null };
export type QuotaResult = { allowed: true } | QuotaBlocked;

export interface RecordUsageInput {
  feature: AiFeature;
  userId: number | null;
  orgId?: number | null;
  provider: AiProvider;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  status: AiUsageStatus;
  blockedReason?: AiBlockReason | null;
}

export interface RunOptions {
  feature: AiFeature;
  userId: number | null;
  orgId?: number | null;
  provider: AiProvider;
  model?: string | null;
  onLimit?: 'throw' | 'skip';
}

export interface MyAiUsage {
  daily: { usedUsd: number; budgetUsd: number; percent: number };
  monthly: { usedUsd: number; budgetUsd: number; percent: number };
  warn: boolean;
  limitedReason: string | null;
}

const SETTINGS_TTL_MS = 30_000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COUNTED: AiUsageStatus[] = ['ok', 'error'];

@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);
  private settingsCache: { value: AiSettings; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- settings -------------------------------------------------------

  async getSettings(): Promise<AiSettings> {
    if (this.settingsCache && Date.now() - this.settingsCache.at < SETTINGS_TTL_MS) {
      return this.settingsCache.value;
    }
    const value = await this.prisma.aiSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    this.settingsCache = { value, at: Date.now() };
    return value;
  }

  invalidateSettings(): void {
    this.settingsCache = null;
  }

  // ---- quota ----------------------------------------------------------

  private async sumCost(where: Prisma.AiUsageWhereInput): Promise<number> {
    const agg = await this.prisma.aiUsage.aggregate({ _sum: { cost_usd: true }, where });
    return Number(agg._sum.cost_usd ?? 0);
  }

  async checkQuota(feature: AiFeature, userId: number | null): Promise<QuotaResult> {
    const settings = await this.getSettings();
    if (!settings.limits_enabled) return { allowed: true };

    const now = new Date();
    const dayStart = startOfDay(now);

    const override = userId !== null ? await this.prisma.aiUserLimit.findUnique({ where: { user_id: userId } }) : null;
    if (override?.blocked) return { allowed: false, reason: 'blocked', retryAt: null };

    const globalUsed = await this.sumCost({ created_at: { gte: dayStart }, status: { in: COUNTED } });
    if (globalUsed >= Number(settings.global_daily_budget_usd)) {
      return { allowed: false, reason: 'global', retryAt: startOfNextDay(now) };
    }

    if (userId === null) return { allowed: true };

    const burst = await this.prisma.aiUsage.count({
      where: { user_id: userId, created_at: { gte: new Date(now.getTime() - 60_000) }, status: { in: COUNTED } },
    });
    if (burst >= settings.burst_per_minute) {
      return { allowed: false, reason: 'burst', retryAt: new Date(now.getTime() + 60_000) };
    }

    const dailyBudget = Number(override?.daily_budget_usd ?? settings.user_daily_budget_usd);
    const dailyUsed = await this.sumCost({ user_id: userId, created_at: { gte: dayStart }, status: { in: COUNTED } });
    if (dailyUsed >= dailyBudget) return { allowed: false, reason: 'daily', retryAt: startOfNextDay(now) };

    const monthlyBudget = Number(override?.monthly_budget_usd ?? settings.user_monthly_budget_usd);
    const monthlyUsed = await this.sumCost({ user_id: userId, created_at: { gte: startOfMonth(now) }, status: { in: COUNTED } });
    if (monthlyUsed >= monthlyBudget) return { allowed: false, reason: 'monthly', retryAt: startOfNextMonth(now) };

    return { allowed: true };
  }

  /** Records a 'blocked' row (+ admin notification) and returns the quota result when not allowed. */
  private async blockIfNeeded(feature: AiFeature, userId: number | null, orgId?: number | null): Promise<QuotaBlocked | null> {
    const res = await this.checkQuota(feature, userId);
    if (res.allowed) return null;
    const q = res as QuotaBlocked;
    await this.notifyAdminsIfFirst(feature, userId, q.reason);
    await this.record({ feature, userId, orgId, provider: 'none', status: 'blocked', blockedReason: q.reason });
    return q;
  }

  async assertQuota(feature: AiFeature, userId: number | null, orgId?: number | null): Promise<void> {
    const q = await this.blockIfNeeded(feature, userId, orgId);
    if (!q) return;
    throw new HttpException(
      { statusCode: 429, code: 'AI_QUOTA_EXCEEDED', reason: q.reason, retryAt: q.retryAt?.toISOString() ?? null, message: 'AI quota exceeded' },
      429,
    );
  }

  // ---- recording ------------------------------------------------------

  /** Never throws into the caller. */
  async record(input: RecordUsageInput): Promise<void> {
    try {
      const inputTokens = input.inputTokens ?? 0;
      const outputTokens = input.outputTokens ?? 0;
      const cost = input.status === 'ok' || input.status === 'error' ? estimateCostUsd(input.model, inputTokens, outputTokens) : 0;
      await this.prisma.aiUsage.create({
        data: {
          user_id: input.userId,
          organization_id: input.orgId ?? null,
          feature: input.feature,
          provider: input.provider,
          model: input.model ?? null,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: cost,
          status: input.status,
          blocked_reason: input.blockedReason ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to record AI usage (${input.feature}): ${(err as Error)?.message}`);
    }
  }

  async run<T>(
    opts: RunOptions,
    call: () => Promise<{ result: T; inputTokens: number; outputTokens: number }>,
  ): Promise<T | null> {
    if (opts.onLimit === 'skip') {
      if (await this.blockIfNeeded(opts.feature, opts.userId, opts.orgId)) return null;
    } else {
      await this.assertQuota(opts.feature, opts.userId, opts.orgId);
    }

    const base = { feature: opts.feature, userId: opts.userId, orgId: opts.orgId, provider: opts.provider, model: opts.model };
    try {
      const { result, inputTokens, outputTokens } = await call();
      await this.record({ ...base, inputTokens, outputTokens, status: 'ok' });
      return result;
    } catch (err) {
      await this.record({ ...base, inputTokens: 0, outputTokens: 0, status: 'error' });
      throw err;
    }
  }

  // ---- result cache ---------------------------------------------------

  hashBuffer(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }

  async getCached<T = unknown>(userId: number, feature: AiFeature, contentHash: string): Promise<T | null> {
    try {
      const row = await this.prisma.aiResultCache.findUnique({
        where: { user_id_feature_content_hash: { user_id: userId, feature, content_hash: contentHash } },
      });
      if (!row || Date.now() - row.created_at.getTime() > CACHE_TTL_MS) return null;
      await this.record({ feature, userId, provider: 'cache', status: 'cached' });
      return row.result as T;
    } catch (err) {
      this.logger.error(`AI cache read failed: ${(err as Error)?.message}`);
      return null;
    }
  }

  async setCached(userId: number, feature: AiFeature, contentHash: string, result: unknown): Promise<void> {
    try {
      const json = result as Prisma.InputJsonValue;
      await this.prisma.aiResultCache.upsert({
        where: { user_id_feature_content_hash: { user_id: userId, feature, content_hash: contentHash } },
        create: { user_id: userId, feature, content_hash: contentHash, result: json },
        update: { result: json, created_at: new Date() },
      });
      await this.prisma.aiResultCache.deleteMany({ where: { created_at: { lt: new Date(Date.now() - CACHE_TTL_MS) } } });
    } catch (err) {
      this.logger.error(`AI cache write failed: ${(err as Error)?.message}`);
    }
  }

  // ---- "me" -----------------------------------------------------------

  async getMyUsage(userId: number): Promise<MyAiUsage> {
    const settings = await this.getSettings();
    const now = new Date();
    const override = await this.prisma.aiUserLimit.findUnique({ where: { user_id: userId } });
    const dailyBudget = Number(override?.daily_budget_usd ?? settings.user_daily_budget_usd);
    const monthlyBudget = Number(override?.monthly_budget_usd ?? settings.user_monthly_budget_usd);
    const [dailyUsed, monthlyUsed, quota] = await Promise.all([
      this.sumCost({ user_id: userId, created_at: { gte: startOfDay(now) }, status: { in: COUNTED } }),
      this.sumCost({ user_id: userId, created_at: { gte: startOfMonth(now) }, status: { in: COUNTED } }),
      this.checkQuota('document_extract', userId),
    ]);
    const pct = (used: number, budget: number) => (budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 100);
    const daily = { usedUsd: dailyUsed, budgetUsd: dailyBudget, percent: pct(dailyUsed, dailyBudget) };
    const monthly = { usedUsd: monthlyUsed, budgetUsd: monthlyBudget, percent: pct(monthlyUsed, monthlyBudget) };
    return {
      daily,
      monthly,
      warn: settings.limits_enabled && (daily.percent >= settings.warn_percent || monthly.percent >= settings.warn_percent),
      limitedReason: quota.allowed ? null : (quota as QuotaBlocked).reason,
    };
  }

  // ---- admin notification --------------------------------------------

  /** Called BEFORE the new 'blocked' row is inserted, so an earlier same-day row means "already notified". */
  private async notifyAdminsIfFirst(feature: AiFeature, userId: number | null, reason: AiBlockReason): Promise<void> {
    if (reason === 'burst') return;
    try {
      const dayStart = startOfDay();
      const seen = await this.prisma.aiUsage.findFirst({
        where: {
          status: 'blocked',
          blocked_reason: reason,
          created_at: { gte: dayStart },
          ...(reason === 'global' ? {} : { user_id: userId }),
        },
        select: { id: true },
      });
      if (seen) return;

      const [admins, user] = await Promise.all([
        this.prisma.user.findMany({ where: { is_admin: true }, select: { id: true } }),
        userId !== null ? this.prisma.user.findUnique({ where: { id: userId }, select: { first_name: true, last_name: true, email: true } }) : null,
      ]);
      const data = {
        reason,
        feature,
        userId,
        userName: user ? `${user.first_name} ${user.last_name}`.trim() : null,
        userEmail: user?.email ?? null,
      };
      await Promise.all(admins.map(a => this.notifications.create(a.id, NotificationType.AI_QUOTA_BLOCKED, data)));
    } catch (err) {
      this.logger.warn(`Could not notify admins of AI quota block (${reason}): ${(err as Error)?.message}`);
    }
  }
}
