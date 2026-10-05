import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FeatureAccessService } from '../../common/features/feature-access.service';
import { FEATURE_KEYS, FeatureKey } from '../../common/features/feature-keys';
import { ACTIVITY_TIMEZONE, localDay } from '../activity/activity-date.util';
import {
  AdminBucket,
  AdminFeatureUsage,
  AdminFunnelStep,
  AdminKpis,
  AdminLabelCount,
  AdminRange,
  AdminRetentionCohort,
  AdminSeriesPoint,
  AdminStatsDto,
  AdminStorageRow,
  AdminUserRow,
} from './dto/admin-stats.dto';
import {
  AdminOrganizationDto,
  UpdateOrganizationFeaturesDto,
} from './dto/admin-organization.dto';

/** Organization row shape shared by the list query and the post-update refetch. */
type OrgWithCounts = {
  id: number;
  name: string;
  plan: string | null;
  feature_flags: Prisma.JsonValue;
  _count: { members: number; cars: number };
};

const ORG_WITH_COUNTS_SELECT = {
  id: true,
  name: true,
  plan: true,
  feature_flags: true,
  _count: { select: { members: true, cars: true } },
} as const;

/** Prisma stores `timestamp without time zone` in UTC — convert to local wall time for bucketing. */
const local = (col: string) => Prisma.raw(`(${col} AT TIME ZONE 'UTC' AT TIME ZONE '${ACTIVITY_TIMEZONE}')`);

interface FeatureDef {
  key: string;
  from: string;
  /** Column that identifies the user a row belongs to; null when the table isn't user-scoped. */
  user: string | null;
  where?: string;
}

// Documents, maintenance records, notes and wishes hang off a car, not a user —
// they're attributed to the car's owner.
const FEATURES: FeatureDef[] = [
  { key: 'cars', from: '"Car" t', user: 't.user_id' },
  { key: 'documents', from: '"Document" t JOIN "Car" k ON k.id = t.car_id', user: 'k.user_id' },
  { key: 'maintenance', from: '"MaintenanceRecord" t JOIN "Car" k ON k.id = t.car_id', user: 'k.user_id' },
  { key: 'notes', from: '"CarNote" t JOIN "Car" k ON k.id = t.car_id', user: 'k.user_id' },
  { key: 'wishes', from: '"CarWish" t JOIN "Car" k ON k.id = t.car_id', user: 'k.user_id' },
  { key: 'carShares', from: '"CarUserAccess" t', user: 't.invited_by_user_id' },
  { key: 'saleContracts', from: 'sale_contracts t', user: 't.user_id' },
  { key: 'blog', from: '"BlogEntry" t', user: 't.user_id' },
  { key: 'maintenanceProfiles', from: '"MaintenanceProfile" t', user: 't.user_id' },
  { key: 'uploads', from: 'uploaded_files t', user: 't.user_id', where: `t.status = 'UPLOADED'` },
  { key: 'navDestinations', from: 'nav_destinations t', user: null },
  { key: 'cockpitProfiles', from: 'cockpit_profiles t', user: null },
];

const RETENTION_COHORTS = 8;
const RETENTION_WEEKS = 8;
/** A user with at least this many documents + maintenance records counts as "engaged" in the funnel. */
const ENGAGED_RECORDS = 5;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return addDays(day, -((d.getUTCDay() + 6) % 7));
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly featureAccess: FeatureAccessService,
  ) {}

  async isAdmin(userId: number): Promise<{ isAdmin: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { is_admin: true } });
    return { isAdmin: !!user?.is_admin };
  }

  /** Every organization with usage counts and effective feature flags, for the app-owner feature-switch screen. */
  async getOrganizations(): Promise<AdminOrganizationDto[]> {
    const orgs = await this.prisma.organization.findMany({
      select: ORG_WITH_COUNTS_SELECT,
      orderBy: { name: 'asc' },
    });
    return orgs.map((org) => this.toOrganizationDto(org));
  }

  /**
   * Enables/disables feature switches for one organization. `false` writes an explicit override
   * into `feature_flags`; `true` removes the override (back to the default of on). Invalidates
   * the org's FeatureAccessService cache so it takes effect on the next request, not after 60s.
   */
  async updateOrganizationFeatures(
    organizationId: number,
    dto: UpdateOrganizationFeaturesDto,
  ): Promise<AdminOrganizationDto> {
    const existing = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { feature_flags: true },
    });
    if (!existing) throw new NotFoundException('Organization not found');

    const flags = this.asFlagsRecord(existing.feature_flags);
    for (const key of FEATURE_KEYS) {
      const value = dto[key];
      if (value === undefined) continue;
      if (value === false) flags[key] = false;
      else delete flags[key]; // true = no override, back to the default of on
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { feature_flags: flags as Prisma.InputJsonValue },
    });
    this.featureAccess.invalidate(organizationId);

    const updated = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: ORG_WITH_COUNTS_SELECT,
    });
    return this.toOrganizationDto(updated!);
  }

  private asFlagsRecord(
    flags: Prisma.JsonValue | null,
  ): Record<string, unknown> {
    return flags && typeof flags === 'object' && !Array.isArray(flags)
      ? { ...(flags as Record<string, unknown>) }
      : {};
  }

  private toOrganizationDto(org: OrgWithCounts): AdminOrganizationDto {
    const raw = this.asFlagsRecord(org.feature_flags);
    const feature_flags = {} as Record<FeatureKey, boolean>;
    for (const key of FEATURE_KEYS) feature_flags[key] = raw[key] !== false;

    return {
      id: org.id,
      name: org.name,
      plan: org.plan,
      member_count: org._count.members,
      car_count: org._count.cars,
      feature_flags,
    };
  }

  async getStats(range: AdminRange): Promise<AdminStatsDto> {
    const today = localDay();
    const start = range === 0 ? null : addDays(today, -(range - 1));
    const prevStart = range === 0 ? null : addDays(today, -(2 * range - 1));

    const inRange = (col: string): Prisma.Sql =>
      start === null ? Prisma.sql`TRUE` : Prisma.sql`${local(col)} >= ${start}::date`;

    const [firstSignup] = await this.prisma.$queryRaw<{ day: string | null }[]>`
      SELECT to_char(MIN(${local('created_at')}), 'YYYY-MM-DD') AS day FROM "User"`;
    const [tracking] = await this.prisma.$queryRaw<{ day: string | null }[]>`
      SELECT to_char(MIN(date), 'YYYY-MM-DD') AS day FROM user_activity_days`;

    const seriesStart = start ?? firstSignup?.day ?? today;
    const span = daysBetween(seriesStart, today);
    const bucket: AdminBucket = span <= 45 ? 'day' : span <= 400 ? 'week' : 'month';

    const [kpis, series, funnel, features, retention, platforms, appVersions, pushUsers, storage, reminders, fleet] =
      await Promise.all([
        this._kpis(today, start, prevStart, inRange),
        this._series(bucket, seriesStart, today),
        this._funnel(inRange),
        this._features(inRange),
        this._retention(today, tracking?.day ?? null),
        this._latestPerUser('platform', today),
        this._latestPerUser('app_version', today),
        this.prisma.$queryRaw<AdminLabelCount[]>`
          SELECT platform::text AS label, COUNT(DISTINCT user_id)::int AS count
          FROM "PushToken" GROUP BY 1 ORDER BY 2 DESC`,
        this.prisma.$queryRaw<AdminStorageRow[]>`
          SELECT context_type AS context, COUNT(*)::int AS files, COALESCE(SUM(size), 0)::float8 AS bytes
          FROM uploaded_files WHERE status = 'UPLOADED' AND deleted_at IS NULL
          GROUP BY 1 ORDER BY 3 DESC`,
        this.prisma.$queryRaw<{ inRange: number; total: number }[]>`
          SELECT COUNT(*) FILTER (WHERE ${inRange('sent_at')})::int AS "inRange", COUNT(*)::int AS total
          FROM "DocumentReminderSent"`,
        this._fleet(),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      range,
      bucket,
      trackingSince: tracking?.day ?? null,
      kpis,
      series,
      funnel,
      features,
      retention,
      platforms,
      appVersions,
      pushUsers,
      storage,
      remindersSent: reminders[0],
      fleet,
    };
  }

  private async _kpis(
    today: string,
    start: string | null,
    prevStart: string | null,
    inRange: (col: string) => Prisma.Sql,
  ): Promise<AdminKpis> {
    const prev =
      start === null || prevStart === null
        ? Prisma.sql`NULL::int`
        : Prisma.sql`(SELECT COUNT(*)::int FROM "User"
            WHERE ${local('created_at')} >= ${prevStart}::date AND ${local('created_at')} < ${start}::date)`;

    const [row] = await this.prisma.$queryRaw<AdminKpis[]>`
      SELECT
        (SELECT COUNT(*)::int FROM "User") AS "totalUsers",
        (SELECT COUNT(*)::int FROM "User" WHERE ${inRange('created_at')}) AS "newUsers",
        ${prev} AS "newUsersPrev",
        (SELECT COUNT(DISTINCT user_id)::int FROM user_activity_days WHERE date = ${today}::date) AS dau,
        (SELECT COUNT(DISTINCT user_id)::int FROM user_activity_days WHERE date > ${today}::date - 7) AS wau,
        (SELECT COUNT(DISTINCT user_id)::int FROM user_activity_days WHERE date > ${today}::date - 30) AS mau,
        (SELECT COUNT(*)::int FROM "Car" WHERE status = 'ACTIVE') AS "totalCars",
        (SELECT COUNT(*)::int FROM "Car" WHERE ${inRange('created_at')}) AS "newCars",
        (SELECT COUNT(*)::int FROM "Document") AS "totalDocuments",
        (SELECT COUNT(*)::int FROM "Document" WHERE ${inRange('created_at')}) AS "newDocuments",
        (SELECT COUNT(*)::int FROM "MaintenanceRecord") AS "totalMaintenance",
        (SELECT COUNT(*)::int FROM "MaintenanceRecord" WHERE ${inRange('created_at')}) AS "newMaintenance"`;
    return row;
  }

  private async _series(bucket: AdminBucket, from: string, to: string): Promise<AdminSeriesPoint[]> {
    const b = Prisma.raw(`'${bucket}'`);
    const inBucket = (col: string) => Prisma.sql`date_trunc(${b}, ${local(col)}) = s.bucket`;

    const rows = await this.prisma.$queryRaw<Omit<AdminSeriesPoint, 'cumulativeUsers'>[]>`
      WITH s AS (
        SELECT generate_series(
          date_trunc(${b}, ${from}::timestamp),
          date_trunc(${b}, ${to}::timestamp),
          ${Prisma.raw(`interval '1 ${bucket}'`)}
        ) AS bucket
      )
      SELECT
        to_char(s.bucket, 'YYYY-MM-DD') AS date,
        (SELECT COUNT(*)::int FROM "User" WHERE ${inBucket('created_at')}) AS signups,
        (SELECT COUNT(DISTINCT user_id)::int FROM user_activity_days
          WHERE date_trunc(${b}, date::timestamp) = s.bucket) AS "activeUsers",
        (SELECT COUNT(*)::int FROM "Car" WHERE ${inBucket('created_at')}) AS cars,
        (SELECT COUNT(*)::int FROM "Document" WHERE ${inBucket('created_at')}) AS documents,
        (SELECT COUNT(*)::int FROM "MaintenanceRecord" WHERE ${inBucket('created_at')}) AS maintenance
      FROM s ORDER BY s.bucket`;

    const [base] = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM "User"
      WHERE date_trunc(${b}, ${local('created_at')}) < date_trunc(${b}, ${from}::timestamp)`;

    let running = base?.n ?? 0;
    return rows.map(r => {
      running += r.signups;
      return { ...r, cumulativeUsers: running };
    });
  }

  /** Funnel over the users who signed up in the selected period. */
  private async _funnel(inRange: (col: string) => Prisma.Sql): Promise<AdminFunnelStep[]> {
    const [row] = await this.prisma.$queryRaw<Record<AdminFunnelStep['key'], number>[]>`
      WITH c AS (
        SELECT u.id,
          (SELECT COUNT(*) FROM "Car" k WHERE k.user_id = u.id) AS cars,
          (SELECT COUNT(*) FROM "Document" d JOIN "Car" k ON k.id = d.car_id WHERE k.user_id = u.id)
            + (SELECT COUNT(*) FROM "MaintenanceRecord" m JOIN "Car" k ON k.id = m.car_id WHERE k.user_id = u.id) AS records,
          EXISTS (SELECT 1 FROM "CarUserAccess" a WHERE a.invited_by_user_id = u.id) AS shared
        FROM "User" u WHERE ${inRange('u.created_at')}
      )
      SELECT
        COUNT(*)::int AS "signedUp",
        COUNT(*) FILTER (WHERE cars > 0)::int AS "addedCar",
        COUNT(*) FILTER (WHERE records > 0)::int AS "addedRecord",
        COUNT(*) FILTER (WHERE records >= ${ENGAGED_RECORDS})::int AS engaged,
        COUNT(*) FILTER (WHERE shared)::int AS "sharedCar"
      FROM c`;
    const order: AdminFunnelStep['key'][] = ['signedUp', 'addedCar', 'addedRecord', 'engaged', 'sharedCar'];
    return order.map(key => ({ key, users: row[key] }));
  }

  private _features(inRange: (col: string) => Prisma.Sql): Promise<AdminFeatureUsage[]> {
    return Promise.all(
      FEATURES.map(async f => {
        const users = f.user ? Prisma.raw(`COUNT(DISTINCT ${f.user})::int`) : Prisma.raw('NULL::int');
        const where = Prisma.raw(f.where ?? 'TRUE');
        const [row] = await this.prisma.$queryRaw<Omit<AdminFeatureUsage, 'key'>[]>`
          SELECT COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE ${inRange('t.created_at')})::int AS "inRange",
                 ${users} AS users
          FROM ${Prisma.raw(f.from)} WHERE ${where}`;
        return { key: f.key, ...row };
      }),
    );
  }

  /**
   * Weekly signup cohorts × weeks since signup → % of the cohort active that
   * week. Weeks that ended before activity tracking started are reported as
   * null, not 0 — "no data" is not "nobody came back".
   */
  private async _retention(today: string, trackingSince: string | null): Promise<AdminRetentionCohort[]> {
    const thisWeek = mondayOf(today);
    const firstCohort = addDays(thisWeek, -7 * (RETENTION_COHORTS - 1));

    const users = await this.prisma.$queryRaw<{ id: number; day: string }[]>`
      SELECT id, to_char(${local('created_at')}, 'YYYY-MM-DD') AS day
      FROM "User" WHERE ${local('created_at')} >= ${firstCohort}::date`;
    const activity = await this.prisma.$queryRaw<{ user_id: number; day: string }[]>`
      SELECT user_id, to_char(date, 'YYYY-MM-DD') AS day
      FROM user_activity_days WHERE date >= ${firstCohort}::date`;

    const activeWeeks = new Map<number, Set<string>>();
    for (const a of activity) {
      if (!activeWeeks.has(a.user_id)) activeWeeks.set(a.user_id, new Set());
      activeWeeks.get(a.user_id)!.add(mondayOf(a.day));
    }

    const cohorts: AdminRetentionCohort[] = [];
    for (let i = 0; i < RETENTION_COHORTS; i++) {
      const week = addDays(firstCohort, 7 * i);
      const members = users.filter(u => mondayOf(u.day) === week);
      const weeks: (number | null)[] = [];
      for (let k = 0; k < RETENTION_WEEKS; k++) {
        const w = addDays(week, 7 * k);
        const weekEnd = addDays(w, 6);
        if (w > thisWeek || members.length === 0 || trackingSince === null || weekEnd < trackingSince) {
          weeks.push(null);
          continue;
        }
        const active = members.filter(m => activeWeeks.get(m.id)?.has(w)).length;
        weeks.push(Math.round((active / members.length) * 100));
      }
      cohorts.push({ week, size: members.length, weeks });
    }
    return cohorts;
  }

  /** Each user active in the last 30 days, counted once by their most recent known value of `column`. */
  private _latestPerUser(column: 'platform' | 'app_version', today: string): Promise<AdminLabelCount[]> {
    const col = Prisma.raw(column);
    return this.prisma.$queryRaw<AdminLabelCount[]>`
      SELECT COALESCE(v, 'unknown') AS label, COUNT(*)::int AS count
      FROM (
        SELECT DISTINCT ON (user_id) user_id, ${col} AS v
        FROM user_activity_days
        WHERE date > ${today}::date - 30
        ORDER BY user_id, (${col} IS NULL), date DESC
      ) x
      GROUP BY 1 ORDER BY 2 DESC`;
  }

  private async _fleet(): Promise<AdminStatsDto['fleet']> {
    const [topMakes, fuelTypes, [agg]] = await Promise.all([
      this.prisma.$queryRaw<AdminLabelCount[]>`
        SELECT MAX(trim(make)) AS label, COUNT(*)::int AS count
        FROM "Car" WHERE status = 'ACTIVE'
        GROUP BY lower(trim(make)) ORDER BY 2 DESC, 1 LIMIT 10`,
      this.prisma.$queryRaw<AdminLabelCount[]>`
        SELECT COALESCE(fuel_type::text, 'UNKNOWN') AS label, COUNT(*)::int AS count
        FROM "Car" WHERE status = 'ACTIVE' GROUP BY 1 ORDER BY 2 DESC`,
      this.prisma.$queryRaw<{ avgYear: number | null; sold: number }[]>`
        SELECT ROUND(AVG(year) FILTER (WHERE status = 'ACTIVE'))::int AS "avgYear",
               COUNT(*) FILTER (WHERE status = 'SOLD')::int AS sold
        FROM "Car"`,
    ]);
    return { topMakes, fuelTypes, avgYear: agg.avgYear, sold: agg.sold };
  }

  /** Counts only — deliberately no document/record content, identity data or car details. */
  getUsers(): Promise<AdminUserRow[]> {
    const today = localDay();
    return this.prisma.$queryRaw<AdminUserRow[]>`
      SELECT
        u.id,
        u.first_name AS "firstName",
        u.last_name AS "lastName",
        u.email,
        u.picture,
        u.is_admin AS "isAdmin",
        u.created_at AS "createdAt",
        u.last_active_at AS "lastActiveAt",
        (SELECT COUNT(*)::int FROM "Car" k WHERE k.user_id = u.id) AS cars,
        (SELECT COUNT(*)::int FROM "CarUserAccess" a WHERE a.user_id = u.id AND a.accepted_at IS NOT NULL) AS "sharedWithMe",
        (SELECT COUNT(*)::int FROM "Document" d JOIN "Car" k ON k.id = d.car_id WHERE k.user_id = u.id) AS documents,
        (SELECT COUNT(*)::int FROM "MaintenanceRecord" m JOIN "Car" k ON k.id = m.car_id WHERE k.user_id = u.id) AS maintenance,
        (SELECT COUNT(*)::int FROM "CarNote" n JOIN "Car" k ON k.id = n.car_id WHERE k.user_id = u.id) AS notes,
        (SELECT COUNT(*)::int FROM "BlogEntry" b WHERE b.user_id = u.id) AS "blogEntries",
        (SELECT COUNT(*)::int FROM user_activity_days a WHERE a.user_id = u.id AND a.date > ${today}::date - 30) AS "activeDays30",
        (SELECT a.platform FROM user_activity_days a WHERE a.user_id = u.id AND a.platform IS NOT NULL
          ORDER BY a.date DESC LIMIT 1) AS platform,
        (SELECT a.app_version FROM user_activity_days a WHERE a.user_id = u.id AND a.app_version IS NOT NULL
          ORDER BY a.date DESC LIMIT 1) AS "appVersion",
        EXISTS (SELECT 1 FROM "PushToken" p WHERE p.user_id = u.id) AS "pushEnabled"
      FROM "User" u
      ORDER BY u.last_active_at DESC NULLS LAST, u.created_at DESC`;
  }
}
