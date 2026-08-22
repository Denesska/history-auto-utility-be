import { ServiceCategory } from '@prisma/client';

export interface MaintenanceIntervalDefault {
  interval_km: number | null;
  interval_months: number | null;
}

// Starting-point defaults, meant to be more realistic than a manufacturer's
// conservative service-plan numbers (e.g. 30-35k km oil change intervals).
// A single constant, not a DB table: easy to tune per category without a
// migration, since there's no requirement yet for these to be admin-editable.
export const DEFAULT_MAINTENANCE_INTERVALS: Record<ServiceCategory, MaintenanceIntervalDefault> = {
  OIL_CHANGE:            { interval_km: 10000, interval_months: 12 },
  BRAKE_SERVICE:         { interval_km: null,  interval_months: 24 },
  TRANSMISSION_SERVICE:  { interval_km: 60000, interval_months: 60 },
  TIRE_SERVICE:          { interval_km: null,  interval_months: 60 },
  FLUID_SERVICE:         { interval_km: null,  interval_months: 24 },
  ENGINE_SERVICE:        { interval_km: 20000, interval_months: 24 },
  INSPECTION:            { interval_km: null,  interval_months: 12 },
  BATTERY_SERVICE:       { interval_km: null,  interval_months: 48 },
  FILTER_SERVICE:        { interval_km: 15000, interval_months: 12 },
  LIGHT_SERVICE:         { interval_km: null,  interval_months: null },
  OTHER:                 { interval_km: null,  interval_months: null },
};
