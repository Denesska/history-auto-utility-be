import { Car, User, UserSettings } from '@prisma/client';
import { MailLang } from '../../modules/mail/templates/base-email.template';

/** Helpers shared by the daily reminder jobs (document-reminders, maintenance-reminders). */

export type UserWithSettings = User & { settings: UserSettings | null };

/** Default "before expiry" offsets when the user has no settings row. */
export const DEFAULT_REMINDER_DAYS = [7, 3, 1, 0];
/** Sent once, the day after expiry, to every user with reminders enabled. */
export const EXPIRED_OFFSET = -1;
/** A reminder whose email failed is retried for this many days after it was first sent. */
export const EMAIL_RETRY_DAYS = 3;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The recipient's own label for the car (private nickname, else make+model) plus the plate. */
export function reminderCarLabel(car: Pick<Car, 'make' | 'model' | 'license_plate'>, nickname: string | undefined): string {
  const name = nickname ?? `${car.make} ${car.model}`.trim();
  return car.license_plate ? `${name} (${car.license_plate})` : name;
}

export function reminderLang(user: UserWithSettings): MailLang {
  return user.settings?.language === 'en' ? 'en' : 'ro';
}

/** Car owner + users with accepted CarUserAccess, deduplicated. */
export function uniqueRecipients(car: { user: UserWithSettings; access_entries: { user: UserWithSettings }[] }): UserWithSettings[] {
  const byId = new Map<number, UserWithSettings>();
  byId.set(car.user.id, car.user);
  for (const entry of car.access_entries) {
    byId.set(entry.user.id, entry.user);
  }
  return [...byId.values()];
}
