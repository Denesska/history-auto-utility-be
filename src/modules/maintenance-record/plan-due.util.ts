import { ServiceCategory } from '@prisma/client';
import { DEFAULT_MAINTENANCE_INTERVALS } from './maintenance-interval.defaults';

/**
 * Server-side port of the Plan page math. MIRRORS (keep in sync):
 * history-auto-utility-fe/src/app/shared/utils/plan-items.util.ts (`buildPlanItems`), so the
 * reminder job and the UI agree on what is "due". Pure: no DB, no clock (`now` is passed in).
 */

export type PlanMultiplierProfile = 'normal' | 'intensive' | 'occasional' | 'custom';

export const PROFILE_MULTIPLIER: Record<PlanMultiplierProfile, number> = {
  normal: 1,
  intensive: 0.7,
  occasional: 1.3,
  custom: 1,
};

export interface PlanRecordInput {
  id: number;
  service_category: ServiceCategory;
  service_date: Date;
  mileage: number | null;
}

/** A CarMaintenanceSetting row (or the relevant part of it). */
export interface PlanSettingInput {
  category: ServiceCategory;
  tracked: boolean;
  custom_interval_km: number | null;
  custom_interval_months: number | null;
}

export interface PlanDueItem {
  category: ServiceCategory;
  lastRecordId: number;
  lastDate: Date;
  intervalKm: number | null;
  intervalMonths: number | null;
  /** Signed: negative = past the km threshold. Null when km cannot be evaluated. */
  kmRemaining: number | null;
  nextDueDate: Date | null;
  /** Same as the UI bar: 0-100, the larger of the km and date progress. */
  progressPercent: number;
  state: 'ok' | 'warning' | 'overdue';
}

/** Same as the FE `addMonths` (local-time setMonth). */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * One item per tracked category that has an interval AND at least one record (categories with no
 * record are 'untracked' in the UI and are not returned). `odometer` null = ignore km entirely
 * (e.g. stale mileage) and decide by date only.
 */
export function computePlanDueItems(input: {
  odometer: number | null;
  records: PlanRecordInput[];
  settings?: PlanSettingInput[];
  profile?: PlanMultiplierProfile;
  now: Date;
}): PlanDueItem[] {
  const { odometer, records, settings = [], profile = 'normal', now } = input;
  const multiplier = PROFILE_MULTIPLIER[profile];
  const items: PlanDueItem[] = [];

  for (const category of Object.keys(DEFAULT_MAINTENANCE_INTERVALS) as ServiceCategory[]) {
    const setting = settings.find(s => s.category === category);
    if (setting?.tracked === false) continue;

    const def = DEFAULT_MAINTENANCE_INTERVALS[category];
    const resolvedKm = setting?.custom_interval_km ?? def.interval_km;
    const resolvedMonths = setting?.custom_interval_months ?? def.interval_months;
    if (resolvedKm == null && resolvedMonths == null) continue;

    // Only the default km interval scales with the usage profile; a typed-in one is authoritative.
    const intervalKm = resolvedKm != null
      ? (setting?.custom_interval_km != null ? resolvedKm : Math.round(resolvedKm * multiplier))
      : null;
    const intervalMonths = resolvedMonths;

    const last = records
      .filter(r => r.service_category === category)
      .sort((a, b) => b.service_date.getTime() - a.service_date.getTime())[0];
    if (!last) continue;

    const kmProgress = (intervalKm != null && odometer != null && last.mileage != null)
      ? (odometer - last.mileage) / intervalKm
      : null;

    const nextDueDate = intervalMonths != null ? addMonths(last.service_date, intervalMonths) : null;
    const dateProgress = (intervalMonths != null && nextDueDate != null)
      ? (now.getTime() - last.service_date.getTime()) / (nextDueDate.getTime() - last.service_date.getTime())
      : null;

    const progress = Math.max(kmProgress ?? -Infinity, dateProgress ?? -Infinity);
    if (progress === -Infinity) continue;
    const progressPercent = Math.min(100, Math.max(0, Math.round(progress * 100)));
    const kmRemaining = kmProgress != null ? intervalKm! - (odometer! - last.mileage!) : null;

    items.push({
      category,
      lastRecordId: last.id,
      lastDate: last.service_date,
      intervalKm,
      intervalMonths,
      kmRemaining,
      nextDueDate,
      progressPercent,
      state: progressPercent >= 100 ? 'overdue' : progressPercent >= 80 ? 'warning' : 'ok',
    });
  }
  return items;
}

export type DueStage = 'SOON' | 'DUE';

/** Reminder window before the due date / km. */
export const SOON_DAYS = 14;
export const SOON_KM = 1000;

/**
 * SOON: not yet due and the date is within 14 days or at most 1000 km are left; DUE: the bar is
 * full (date or km reached); null otherwise. `daysToDue` = whole calendar days from today to nextDueDate.
 */
export function decideStage(item: PlanDueItem, daysToDue: number | null): { stage: DueStage; soonBy?: 'date' | 'km' | 'both' } | null {
  if (item.state === 'overdue') return { stage: 'DUE' };
  const byDate = daysToDue != null && daysToDue <= SOON_DAYS;
  const byKm = item.kmRemaining != null && item.kmRemaining <= SOON_KM;
  if (!byDate && !byKm) return null;
  return { stage: 'SOON', soonBy: byDate && byKm ? 'both' : byDate ? 'date' : 'km' };
}

/** After becoming due, OVERDUE repeats every 30 days, at most 3 times (+30, +60, +90); then silence until a new record. */
export const OVERDUE_STEP_DAYS = 30;
export const MAX_OVERDUE_STEPS = 3;

/**
 * What to send for an item whose bar is full. `daysPastDue` = whole days since it became due (the
 * earlier of the passed due date and the first time we saw it; 0 when first seen and not past a date).
 * - within 30 days of due: DUE, once (`hasDueRow` = already sent);
 * - 30-day step n (1..3): OVERDUE:n, so an item first seen 40 days late gets one OVERDUE, not DUE;
 * - beyond the 3rd step: nothing (stay silent until a newer record starts a new cycle).
 */
export function decideDueAction(daysPastDue: number, hasDueRow: boolean): { stage: 'DUE' } | { stage: 'OVERDUE'; step: number } | null {
  const step = Math.floor(daysPastDue / OVERDUE_STEP_DAYS);
  if (step === 0) return hasDueRow ? null : { stage: 'DUE' };
  if (step > MAX_OVERDUE_STEPS) return null;
  return { stage: 'OVERDUE', step };
}
