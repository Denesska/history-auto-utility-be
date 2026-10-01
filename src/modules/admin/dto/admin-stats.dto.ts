/** 0 = all time. */
export const ADMIN_RANGES = [7, 30, 90, 365, 0] as const;
export type AdminRange = (typeof ADMIN_RANGES)[number];

export type AdminBucket = 'day' | 'week' | 'month';

export interface AdminKpis {
  totalUsers: number;
  newUsers: number;
  /** Same-length period right before the selected one; null for "all time". */
  newUsersPrev: number | null;
  dau: number;
  wau: number;
  mau: number;
  totalCars: number;
  newCars: number;
  totalDocuments: number;
  newDocuments: number;
  totalMaintenance: number;
  newMaintenance: number;
}

export interface AdminSeriesPoint {
  /** Bucket start, `YYYY-MM-DD`, Europe/Bucharest. */
  date: string;
  signups: number;
  cumulativeUsers: number;
  activeUsers: number;
  cars: number;
  documents: number;
  maintenance: number;
}

export interface AdminFunnelStep {
  key: 'signedUp' | 'addedCar' | 'addedRecord' | 'engaged' | 'sharedCar';
  users: number;
}

export interface AdminFeatureUsage {
  key: string;
  total: number;
  inRange: number;
  /** Distinct users who have ever used it; null where rows aren't tied to a user. */
  users: number | null;
}

export interface AdminRetentionCohort {
  /** Monday of the signup week, `YYYY-MM-DD`. */
  week: string;
  size: number;
  /** Percent of the cohort active in week +0, +1, … ; null = not measurable (future, or before tracking started). */
  weeks: (number | null)[];
}

export interface AdminLabelCount {
  label: string;
  count: number;
}

export interface AdminStorageRow {
  context: string;
  files: number;
  bytes: number;
}

export interface AdminStatsDto {
  generatedAt: string;
  range: AdminRange;
  bucket: AdminBucket;
  /** First day with activity tracking data, `YYYY-MM-DD`; null if none yet. */
  trackingSince: string | null;
  kpis: AdminKpis;
  series: AdminSeriesPoint[];
  funnel: AdminFunnelStep[];
  features: AdminFeatureUsage[];
  retention: AdminRetentionCohort[];
  platforms: AdminLabelCount[];
  appVersions: AdminLabelCount[];
  pushUsers: AdminLabelCount[];
  storage: AdminStorageRow[];
  remindersSent: { inRange: number; total: number };
  fleet: {
    topMakes: AdminLabelCount[];
    fuelTypes: AdminLabelCount[];
    avgYear: number | null;
    sold: number;
  };
}

export interface AdminUserRow {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  picture: string;
  isAdmin: boolean;
  createdAt: string;
  lastActiveAt: string | null;
  cars: number;
  sharedWithMe: number;
  documents: number;
  maintenance: number;
  notes: number;
  blogEntries: number;
  activeDays30: number;
  platform: string | null;
  appVersion: string | null;
  pushEnabled: boolean;
}
