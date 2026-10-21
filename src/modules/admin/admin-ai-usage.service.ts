import { Injectable, NotFoundException } from '@nestjs/common';
import { AiSettings, AiUserLimit, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfDay, startOfMonth } from '../ai-usage/ai-time';
import { AiUsageService } from '../ai-usage/ai-usage.service';
import {
  AiSettingsDto, AiUsageStatsDto, AiUserLimitDto, UpdateAiSettingsDto, UpdateAiUserLimitDto,
} from './dto/admin-ai.dto';

const TZ = 'Europe/Bucharest';
const DAY_MS = 24 * 60 * 60 * 1000;

const num = (v: unknown): number => Number(v ?? 0);

function toSettingsDto(s: AiSettings): AiSettingsDto {
  return {
    limitsEnabled: s.limits_enabled,
    burstPerMinute: s.burst_per_minute,
    userDailyBudgetUsd: Number(s.user_daily_budget_usd),
    userMonthlyBudgetUsd: Number(s.user_monthly_budget_usd),
    globalDailyBudgetUsd: Number(s.global_daily_budget_usd),
    warnPercent: s.warn_percent,
  };
}

function toLimitDto(l: AiUserLimit): AiUserLimitDto {
  return {
    dailyBudgetUsd: l.daily_budget_usd === null ? null : Number(l.daily_budget_usd),
    monthlyBudgetUsd: l.monthly_budget_usd === null ? null : Number(l.monthly_budget_usd),
    blocked: l.blocked,
    note: l.note,
  };
}

/** 'YYYY-MM-DD' of the given instant in Europe/Bucharest. */
function localDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

@Injectable()
export class AdminAiUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiUsage: AiUsageService,
  ) {}

  async getStats(days: number): Promise<AiUsageStatsDto> {
    const now = new Date();
    const todayStart = startOfDay(now);
    // Window = today (local) plus the previous days-1 local days.
    const from = startOfDay(new Date(todayStart.getTime() - (days - 1) * DAY_MS + 12 * 60 * 60 * 1000));
    const inRange: Prisma.AiUsageWhereInput = { created_at: { gte: from } };
    const counted = { status: { in: ['ok', 'error'] } };

    const [totalsRaw, uniqueUsersRaw, dayRows, featureRows, modelRows, userRows, blocks, todayAgg, settings] = await Promise.all([
      this.prisma.aiUsage.groupBy({
        by: ['status'], where: inRange,
        _count: { _all: true }, _sum: { input_tokens: true, output_tokens: true, cost_usd: true },
      }),
      this.prisma.aiUsage.findMany({ where: { ...inRange, user_id: { not: null } }, distinct: ['user_id'], select: { user_id: true } }),
      this.prisma.$queryRaw<{ d: string; status: string; n: bigint; i: bigint; o: bigint; c: Prisma.Decimal }[]>`
        SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS d, status,
               COUNT(*) AS n, COALESCE(SUM(input_tokens), 0) AS i, COALESCE(SUM(output_tokens), 0) AS o,
               COALESCE(SUM(cost_usd), 0) AS c
        FROM "AiUsage" WHERE created_at >= ${from} GROUP BY 1, 2`,
      this.prisma.aiUsage.groupBy({
        by: ['feature', 'status'], where: inRange,
        _count: { _all: true }, _sum: { input_tokens: true, output_tokens: true, cost_usd: true },
      }),
      this.prisma.aiUsage.groupBy({
        by: ['provider', 'model'], where: { ...inRange, ...counted },
        _count: { _all: true }, _sum: { input_tokens: true, output_tokens: true, cost_usd: true },
      }),
      this.prisma.aiUsage.groupBy({
        by: ['user_id', 'status'], where: { ...inRange, user_id: { not: null } },
        _count: { _all: true }, _sum: { input_tokens: true, output_tokens: true, cost_usd: true },
      }),
      this.prisma.aiUsage.findMany({
        where: { ...inRange, status: 'blocked' }, orderBy: { created_at: 'desc' }, take: 50,
        include: { user: { select: { id: true, first_name: true, last_name: true, email: true } } },
      }),
      this.prisma.aiUsage.aggregate({ _sum: { cost_usd: true }, where: { created_at: { gte: todayStart }, ...counted } }),
      this.aiUsage.getSettings(),
    ]);

    // totals
    const totals = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, blockedCount: 0, cachedCount: 0, uniqueUsers: uniqueUsersRaw.length };
    for (const r of totalsRaw) {
      const n = r._count._all;
      if (r.status === 'blocked') totals.blockedCount += n;
      else if (r.status === 'cached') totals.cachedCount += n;
      else {
        totals.calls += n;
        totals.inputTokens += num(r._sum.input_tokens);
        totals.outputTokens += num(r._sum.output_tokens);
        totals.costUsd += num(r._sum.cost_usd);
      }
    }

    // today
    const todayCost = num(todayAgg._sum.cost_usd);
    const globalBudget = Number(settings.global_daily_budget_usd);
    const today = {
      costUsd: todayCost,
      globalBudgetUsd: globalBudget,
      percent: globalBudget > 0 ? Math.round((todayCost / globalBudget) * 100) : 0,
    };

    // perDay, zero-filled
    const dayMap = new Map<string, AiUsageStatsDto['perDay'][number]>();
    for (let k = 0; k < days; k++) {
      const date = localDate(new Date(from.getTime() + k * DAY_MS + 12 * 60 * 60 * 1000));
      dayMap.set(date, { date, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, blockedCount: 0 });
    }
    for (const r of dayRows) {
      const row = dayMap.get(r.d);
      if (!row) continue;
      if (r.status === 'blocked') row.blockedCount += num(r.n);
      else if (r.status === 'ok' || r.status === 'error') {
        row.calls += num(r.n);
        row.inputTokens += num(r.i);
        row.outputTokens += num(r.o);
        row.costUsd += num(r.c);
      }
    }
    const perDay = [...dayMap.values()];

    // perFeature
    const featMap = new Map<string, AiUsageStatsDto['perFeature'][number]>();
    for (const r of featureRows) {
      const row = featMap.get(r.feature) ?? { feature: r.feature, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, blockedCount: 0, cachedCount: 0 };
      if (r.status === 'blocked') row.blockedCount += r._count._all;
      else if (r.status === 'cached') row.cachedCount += r._count._all;
      else {
        row.calls += r._count._all;
        row.inputTokens += num(r._sum.input_tokens);
        row.outputTokens += num(r._sum.output_tokens);
        row.costUsd += num(r._sum.cost_usd);
      }
      featMap.set(r.feature, row);
    }
    const perFeature = [...featMap.values()].sort((a, b) => b.costUsd - a.costUsd);

    const perModel = modelRows
      .map(r => ({
        provider: r.provider, model: r.model, calls: r._count._all,
        inputTokens: num(r._sum.input_tokens), outputTokens: num(r._sum.output_tokens), costUsd: num(r._sum.cost_usd),
      }))
      .sort((a, b) => b.costUsd - a.costUsd);

    // topUsers
    const userMap = new Map<number, { calls: number; inputTokens: number; outputTokens: number; costUsd: number; blockedCount: number }>();
    for (const r of userRows) {
      const id = r.user_id as number;
      const row = userMap.get(id) ?? { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, blockedCount: 0 };
      if (r.status === 'blocked') row.blockedCount += r._count._all;
      else if (r.status === 'ok' || r.status === 'error') {
        row.calls += r._count._all;
        row.inputTokens += num(r._sum.input_tokens);
        row.outputTokens += num(r._sum.output_tokens);
        row.costUsd += num(r._sum.cost_usd);
      }
      userMap.set(id, row);
    }
    const topIds = [...userMap.entries()].sort((a, b) => b[1].costUsd - a[1].costUsd).slice(0, 20).map(([id]) => id);
    const monthStart = startOfMonth(now);
    const [users, limits, todayByUser, monthByUser] = topIds.length
      ? await Promise.all([
          this.prisma.user.findMany({ where: { id: { in: topIds } }, select: { id: true, first_name: true, last_name: true, email: true } }),
          this.prisma.aiUserLimit.findMany({ where: { user_id: { in: topIds } } }),
          this.prisma.aiUsage.groupBy({ by: ['user_id'], where: { user_id: { in: topIds }, created_at: { gte: todayStart }, ...counted }, _sum: { cost_usd: true } }),
          this.prisma.aiUsage.groupBy({ by: ['user_id'], where: { user_id: { in: topIds }, created_at: { gte: monthStart }, ...counted }, _sum: { cost_usd: true } }),
        ])
      : [[], [], [], []];
    const userById = new Map(users.map(u => [u.id, u]));
    const limitById = new Map(limits.map(l => [l.user_id, l]));
    const todayById = new Map(todayByUser.map(r => [r.user_id, num(r._sum.cost_usd)]));
    const monthById = new Map(monthByUser.map(r => [r.user_id, num(r._sum.cost_usd)]));
    const topUsers = topIds.map(id => {
      const u = userById.get(id);
      const l = limitById.get(id);
      return {
        userId: id,
        name: u ? `${u.first_name} ${u.last_name}`.trim() : '',
        email: u?.email ?? '',
        ...userMap.get(id)!,
        todayCostUsd: todayById.get(id) ?? 0,
        monthCostUsd: monthById.get(id) ?? 0,
        limit: l ? toLimitDto(l) : null,
      };
    });

    const recentBlocks = blocks.map(b => ({
      createdAt: b.created_at.toISOString(),
      userId: b.user_id,
      name: b.user ? `${b.user.first_name} ${b.user.last_name}`.trim() : null,
      email: b.user?.email ?? null,
      feature: b.feature,
      reason: b.blocked_reason,
    }));

    return {
      range: { from: from.toISOString(), to: now.toISOString() },
      totals, today, perDay, perFeature, perModel, topUsers, recentBlocks,
    };
  }

  // ---- settings ---------------------------------------------------------

  async getSettings(): Promise<AiSettingsDto> {
    return toSettingsDto(await this.prisma.aiSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }));
  }

  async updateSettings(dto: UpdateAiSettingsDto): Promise<AiSettingsDto> {
    const data: Prisma.AiSettingsUpdateInput = {};
    if (dto.limitsEnabled !== undefined) data.limits_enabled = dto.limitsEnabled;
    if (dto.burstPerMinute !== undefined) data.burst_per_minute = dto.burstPerMinute;
    if (dto.userDailyBudgetUsd !== undefined) data.user_daily_budget_usd = dto.userDailyBudgetUsd;
    if (dto.userMonthlyBudgetUsd !== undefined) data.user_monthly_budget_usd = dto.userMonthlyBudgetUsd;
    if (dto.globalDailyBudgetUsd !== undefined) data.global_daily_budget_usd = dto.globalDailyBudgetUsd;
    if (dto.warnPercent !== undefined) data.warn_percent = dto.warnPercent;
    const row = await this.prisma.aiSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data as Prisma.AiSettingsCreateInput }, update: data });
    this.aiUsage.invalidateSettings();
    return toSettingsDto(row);
  }

  // ---- per-user limit ---------------------------------------------------

  private async assertUser(userId: number): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) throw new NotFoundException('User not found');
  }

  async getUserLimit(userId: number): Promise<AiUserLimitDto | null> {
    await this.assertUser(userId);
    const l = await this.prisma.aiUserLimit.findUnique({ where: { user_id: userId } });
    return l ? toLimitDto(l) : null;
  }

  async setUserLimit(userId: number, dto: UpdateAiUserLimitDto, adminId: number): Promise<AiUserLimitDto> {
    await this.assertUser(userId);
    const data = {
      daily_budget_usd: dto.dailyBudgetUsd,
      monthly_budget_usd: dto.monthlyBudgetUsd,
      blocked: dto.blocked,
      note: dto.note ?? null,
      updated_by: adminId,
    };
    const l = await this.prisma.aiUserLimit.upsert({
      where: { user_id: userId }, create: { user_id: userId, ...data }, update: data,
    });
    return toLimitDto(l);
  }

  async deleteUserLimit(userId: number): Promise<void> {
    await this.assertUser(userId);
    await this.prisma.aiUserLimit.deleteMany({ where: { user_id: userId } });
  }
}
