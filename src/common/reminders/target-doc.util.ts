import { startOfDay } from './reminder.util';

interface ReminderDoc {
  id?: number;
  expiry_date: Date | null;
}

/**
 * Document a reminder should target for ONE (car, type) group of active docs: the one with the latest
 * expiry date. Any later-expiring doc of the same group supersedes the others, gap or no gap, so no
 * notification of any kind is sent for a superseded doc. Ties on the same day: the higher id wins
 * (deterministic). Docs without expiry are ignored; returns null when none has one.
 */
export function reminderTargetDoc<T extends ReminderDoc>(docs: T[]): T | null {
  const withExpiry = docs.filter(d => d.expiry_date != null);
  if (!withExpiry.length) return null;
  const expiryOf = (d: T) => startOfDay(d.expiry_date as Date).getTime();
  return withExpiry.reduce((a, b) => {
    if (expiryOf(b) !== expiryOf(a)) return expiryOf(b) > expiryOf(a) ? b : a;
    return (b.id ?? 0) > (a.id ?? 0) ? b : a;
  });
}
