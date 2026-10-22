import { PlanItemKey, ServiceCategory } from '@prisma/client';

/**
 * Catalog of Plan items and their default intervals. MIRRORED on the frontend in
 * history-auto-utility-fe/src/app/shared/config/plan-item.catalog.ts — change both together.
 * A code constant, not a table: tunable without a migration.
 */

export const OIL_VISCOSITIES = [
  '0W-16', '0W-20', '0W-30', '0W-40', '5W-20', '5W-30', '5W-40', '10W-40', '10W-60', '15W-40', '20W-50',
] as const;

export type OilViscosity = (typeof OIL_VISCOSITIES)[number];

/** Engine-oil change distance by viscosity (thinner synthetic oils last longer). Unknown -> 10000. */
export function engineOilKmFor(viscosity: string | null | undefined): number {
  switch (viscosity) {
    case '0W-16':
    case '0W-20':
    case '0W-30':
    case '5W-20':
      return 15000;
    case '0W-40':
    case '5W-30':
    case '5W-40':
      return 12000;
    case '10W-40':
    case '10W-60':
    case '15W-40':
    case '20W-50':
      return 8000;
    default:
      return 10000;
  }
}

/** The car attributes that decide which items apply and their intervals. */
export interface PlanItemCarInfo {
  fuel_type?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  engine_oil_viscosity?: string | null;
}

export interface PlanItemDefinition {
  key: PlanItemKey;
  km: number | null;
  months: number | null;
  /** Due after this many engine-oil changes since the item was last done (null = n/a). */
  oilChanges: number | null;
  trackedByDefault: boolean;
}

/** Items that apply to this car, in enum order, with their default intervals. Non-applicable items are omitted. */
export function getPlanItemDefinitions(car: PlanItemCarInfo): PlanItemDefinition[] {
  const electric = car.fuel_type === 'ELECTRIC';
  const diesel = car.fuel_type === 'DIESEL';
  const manual = car.transmission === 'MANUAL';
  const rearDriven = car.drivetrain === 'REAR' || car.drivetrain === 'ALL_WHEEL';

  const defs: PlanItemDefinition[] = [];
  const add = (key: PlanItemKey, km: number | null, months: number | null, oilChanges: number | null, trackedByDefault: boolean) =>
    defs.push({ key, km, months, oilChanges, trackedByDefault });

  if (!electric) add('ENGINE_OIL', engineOilKmFor(car.engine_oil_viscosity), 12, null, true);
  if (!electric) add('AIR_FILTER', 30000, 24, null, true);
  add('CABIN_FILTER', 15000, 12, null, true);
  if (!electric) add('FUEL_FILTER', diesel ? null : 60000, diesel ? 24 : 60, diesel ? 2 : null, diesel);
  add('GEARBOX_OIL', manual ? 80000 : 60000, 60, null, !electric);
  if (rearDriven) add('DIFFERENTIAL_OIL', 60000, 60, null, true);
  add('BRAKE_FLUID', null, 24, null, true);
  add('COOLANT', 100000, 60, null, true);
  add('POWER_STEERING_FLUID', 100000, 60, null, false);
  add('AC_SERVICE', null, 24, null, false);
  add('TIRES', null, 72, null, true);
  add('INSPECTION', null, 12, null, true);
  // Some engines have a chain instead; users simply ignore the item (see the hint).
  if (!electric) add('TIMING_BELT', 100000, 60, null, true);
  return defs;
}

/** Plan item -> the ServiceCategory a record gets when none is given (cost reports / history icons). */
export const PLAN_ITEM_TO_CATEGORY: Record<PlanItemKey, ServiceCategory> = {
  ENGINE_OIL: 'OIL_CHANGE',
  AIR_FILTER: 'FILTER_SERVICE',
  CABIN_FILTER: 'FILTER_SERVICE',
  FUEL_FILTER: 'FILTER_SERVICE',
  GEARBOX_OIL: 'TRANSMISSION_SERVICE',
  DIFFERENTIAL_OIL: 'TRANSMISSION_SERVICE',
  BRAKE_FLUID: 'BRAKE_SERVICE',
  COOLANT: 'FLUID_SERVICE',
  POWER_STEERING_FLUID: 'FLUID_SERVICE',
  AC_SERVICE: 'FLUID_SERVICE',
  TIRES: 'TIRE_SERVICE',
  INSPECTION: 'INSPECTION',
  TIMING_BELT: 'ENGINE_SERVICE',
  BRAKE_PARTS: 'BRAKE_SERVICE',
  BATTERY: 'BATTERY_SERVICE',
  LIGHTS: 'LIGHT_SERVICE',
  SUSPENSION: 'OTHER',
  ENGINE_REPAIR: 'ENGINE_SERVICE',
  BODYWORK: 'OTHER',
  ELECTRICAL: 'OTHER',
};

/** Work items: pickable on a record but with no interval, so never on Plan bars, reminders or settings. */
export const WORK_ITEM_KEYS: readonly PlanItemKey[] = ['BRAKE_PARTS', 'BATTERY', 'LIGHTS', 'SUSPENSION', 'ENGINE_REPAIR', 'BODYWORK', 'ELECTRICAL'];

const PLAN_ITEM_ORDER = (Object.keys(PLAN_ITEM_TO_CATEGORY) as PlanItemKey[]).filter(k => !WORK_ITEM_KEYS.includes(k));

/** First ticked PLAN item in enum order decides; work items only when no plan item is ticked; null when nothing is ticked. */
export function deriveCategoryFromItems(items: readonly PlanItemKey[] | null | undefined): ServiceCategory | null {
  if (!items?.length) return null;
  const first = PLAN_ITEM_ORDER.find(k => items.includes(k)) ?? WORK_ITEM_KEYS.find(k => items.includes(k));
  return first ? PLAN_ITEM_TO_CATEGORY[first] : null;
}
