import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CarReminderMute, ReminderSnooze, ReminderSnoozeKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CarAccessService } from '../car-access/car-access.service';
import { MS_PER_DAY, startOfDay } from '../../common/reminders/reminder.util';

export interface SnoozeIdentity {
  carId: number;
  kind: ReminderSnoozeKind;
  itemKey: string;
}

/** Snooze lookup used by the reminder jobs: `${userId}:${kind}:${itemKey}` -> row. */
export type SnoozeMap = Map<string, ReminderSnooze>;

export function snoozeMapKey(userId: number, kind: ReminderSnoozeKind, itemKey: string): string {
  return `${userId}:${kind}:${itemKey}`;
}

/** Plan item of a MAINTENANCE_DUE notification payload; notifications stored before Plan items carry only a category. */
function planItemOf(d: Record<string, unknown>): string {
  if (typeof d.item === 'string') return d.item;
  const legacy: Record<string, string> = { OIL_CHANGE: 'ENGINE_OIL', TRANSMISSION_SERVICE: 'GEARBOX_OIL', TIRE_SERVICE: 'TIRES', INSPECTION: 'INSPECTION' };
  return legacy[String(d.category)] ?? String(d.category);
}

/** Snooze key of a maintenance plan item (PlanItemKey + the record that started the cycle). */
export function planSnoozeKey(item: string, lastRecordId: number): string {
  return `${item}:${lastRecordId}`;
}

/**
 * What a snooze row means for a job run: `silent` (skip the item), `ended` (a timed snooze elapsed and
 * its single "snooze ended" reminder has not gone out yet), or `none` (no snooze, or already handled).
 */
export function snoozeState(row: ReminderSnooze | undefined, today: Date): 'none' | 'silent' | 'ended' {
  if (!row) return 'none';
  if (row.until == null) return 'silent';
  if (startOfDay(row.until).getTime() > today.getTime()) return 'silent';
  return row.end_notified_at ? 'none' : 'ended';
}

/** Whether a car-level mute is in force on `today` (timed mutes just end — no catch-up). */
export function isCarMuted(row: CarReminderMute | undefined, today: Date): boolean {
  return !!row && (row.until == null || row.until.getTime() > today.getTime());
}

export function carMuteMapKey(userId: number, carId: number): string {
  return `${userId}:${carId}`;
}

@Injectable()
export class ReminderSnoozeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carAccess: CarAccessService,
  ) {}

  /** Snooze the item behind one of the user's reminder notifications (and mark that notification read). */
  async snoozeFromNotification(userId: number, notificationId: number, days: 7 | 30 | null): Promise<{ until: Date | null }> {
    const identity = await this.identityOf(userId, notificationId);
    await this.carAccess.assertHasAccess(identity.carId, userId);

    const until = days == null ? null : new Date(startOfDay(new Date()).getTime() + days * MS_PER_DAY);
    await this.prisma.reminderSnooze.upsert({
      where: { user_id_kind_item_key: { user_id: userId, kind: identity.kind, item_key: identity.itemKey } },
      create: { user_id: userId, car_id: identity.carId, kind: identity.kind, item_key: identity.itemKey, until },
      update: { until, end_notified_at: null },
    });
    await this.prisma.notification.updateMany({ where: { id: notificationId, user_id: userId, read_at: null }, data: { read_at: new Date() } });
    return { until };
  }

  /** Remove the snooze behind a notification (back to the normal cadence). */
  async unsnoozeFromNotification(userId: number, notificationId: number): Promise<void> {
    const identity = await this.identityOf(userId, notificationId);
    await this.prisma.reminderSnooze.deleteMany({ where: { user_id: userId, kind: identity.kind, item_key: identity.itemKey } });
  }

  // ── car-level mute (per user, per car) ────────────────────────────────

  async muteCar(userId: number, carId: number, months: 1 | 3 | 6 | null): Promise<{ carId: number; until: Date | null }> {
    await this.carAccess.assertHasAccess(carId, userId);
    let until: Date | null = null;
    if (months != null) {
      until = startOfDay(new Date());
      until.setMonth(until.getMonth() + months);
    }
    await this.prisma.carReminderMute.upsert({
      where: { user_id_car_id: { user_id: userId, car_id: carId } },
      create: { user_id: userId, car_id: carId, until },
      update: { until },
    });
    return { carId, until };
  }

  async unmuteCar(userId: number, carId: number): Promise<void> {
    await this.carAccess.assertHasAccess(carId, userId);
    await this.prisma.carReminderMute.deleteMany({ where: { user_id: userId, car_id: carId } });
  }

  /** The user's currently active mutes (expired timed ones are left out), restricted to cars they can still see. */
  async listMutes(userId: number): Promise<{ carId: number; until: Date | null }[]> {
    const rows = await this.prisma.carReminderMute.findMany({
      where: { user_id: userId, OR: [{ until: null }, { until: { gt: new Date() } }] },
    });
    const visible = new Set(await this.carAccess.getAccessibleCarIds(userId));
    return rows.filter(r => visible.has(r.car_id)).map(r => ({ carId: r.car_id, until: r.until }));
  }

  private async identityOf(userId: number, notificationId: number): Promise<SnoozeIdentity> {
    const n = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!n || n.user_id !== userId) throw new NotFoundException('Notification not found');
    const d = (n.data ?? {}) as Record<string, unknown>;
    const carId = typeof d.carId === 'number' ? d.carId : null;
    if (carId == null) throw new BadRequestException('Notification cannot be snoozed');

    if (n.type === 'DOCUMENT_EXPIRING' && typeof d.docId === 'number') {
      return { carId, kind: 'DOCUMENT', itemKey: String(d.docId) };
    }
    if (n.type === 'MAINTENANCE_DUE' && typeof d.recordId === 'number') {
      return d.stage === 'EXPIRY'
        ? { carId, kind: 'MAINTENANCE_RECORD', itemKey: String(d.recordId) }
        : { carId, kind: 'MAINTENANCE_PLAN', itemKey: planSnoozeKey(planItemOf(d), d.recordId) };
    }
    throw new BadRequestException('Notification cannot be snoozed');
  }
}
