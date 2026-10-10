/**
 * Activity days and all admin-page date buckets are counted in the app's
 * home timezone, not UTC — otherwise someone using the app at 01:30 local
 * time would land on "yesterday".
 */
export const ACTIVITY_TIMEZONE = 'Europe/Bucharest';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ACTIVITY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `YYYY-MM-DD` of `date` in {@link ACTIVITY_TIMEZONE}. */
export function localDay(date: Date = new Date()): string {
  return dayFormatter.format(date);
}
