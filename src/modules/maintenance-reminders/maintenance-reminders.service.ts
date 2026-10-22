import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Car, CarStatus, MaintenanceRecord, MaintenanceReminderSent, Prisma, ReminderSnooze, CarReminderMute, ServiceCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FeatureAccessService } from '../../common/features/feature-access.service';
import { MailService } from '../mail/mail.service';
import { MaintenanceDueData, MaintenanceDueStage } from '../mail/templates/maintenance-due.template';
import { NotificationsService } from '../notifications/notifications.service';
import { carMuteMapKey, isCarMuted, planSnoozeKey, snoozeMapKey, snoozeState } from '../reminder-snooze/reminder-snooze.service';
import { OVERDUE_STEP_DAYS, computePlanDueItems, decideDueAction, decideStage, PlanDueItem, PlanRecordInput } from '../maintenance-record/plan-due.util';
import {
  DEFAULT_REMINDER_DAYS,
  EMAIL_RETRY_DAYS,
  EXPIRED_OFFSET,
  MS_PER_DAY,
  UserWithSettings,
  reminderCarLabel,
  reminderLang,
  startOfDay,
  uniqueRecipients,
} from '../../common/reminders/reminder.util';

type CarWithRecipients = Car & {
  user: UserWithSettings;
  access_entries: { user: UserWithSettings }[];
  maintenanceRecords: MaintenanceRecord[];
};

/** Mileage not refreshed for this long is ignored: the decision falls back to the date only. */
const STALE_MILEAGE_DAYS = 60;
/** A snooze-end reminder is still sent for a record date that passed at most this many days ago. */
const SNOOZE_END_MAX_DAYS_PAST = 30;

export interface RunOptions {
  /** Compute and log who would be notified; send and write nothing. */
  dryRun?: boolean;
  /** Pretend this is now (for verifying stages). */
  today?: Date;
  /** Restrict recipients to this user (testing real sends safely). */
  onlyUserId?: number;
}

export interface ReminderCandidate {
  userId: number;
  email: string;
  carId: number;
  carLabel: string;
  category: ServiceCategory;
  stage: MaintenanceDueStage;
  key: string;
  daysLeft: number | null;
  kmRemaining: number | null;
  overdueDays: number | null;
  action: 'send' | 'already-sent' | 'retry-email' | 'snooze-end';
}

export interface RunSummary {
  dryRun: boolean;
  today: string;
  carsScanned: number;
  itemsConsidered: number;
  /** Cars whose km were ignored because the mileage is older than 60 days. */
  carsWithStaleMileage: number;
  inApp: number;
  push: number;
  emailSent: number;
  emailFailed: number;
  failures: number;
  candidates: ReminderCandidate[];
}

/** Notification payload; also what is stored in MaintenanceReminderSent.data so a failed email can be retried. */
type ReminderPayload = Omit<MaintenanceDueData, 'nextDueDate' | 'appUrl'> & {
  carId: number;
  /** Set on the single reminder sent when a timed snooze ended. */
  snoozeEnd?: boolean;
  recordId: number;
  nextDueDate: string | null;
};

interface RunContext {
  summary: RunSummary;
  nicknames: Map<string, string>;
  /** `${userId}:${carId}:${key}` -> existing dedup row. */
  sent: Map<string, MaintenanceReminderSent>;
  /** `${userId}:${kind}:${itemKey}` -> snooze row (plan items and record dates). */
  snoozes: Map<string, ReminderSnooze>;
  /** `${userId}:${carId}` -> car-level mute. */
  mutes: Map<string, CarReminderMute>;
  now: Date;
}

@Injectable()
export class MaintenanceRemindersService {
  private readonly logger = new Logger(MaintenanceRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly featureAccess: FeatureAccessService,
  ) {}

  @Cron('5 8 * * *')
  async checkMaintenanceDue(): Promise<void> {
    if (this.configService.get<string>('REMINDERS_CRON_DISABLED') === 'true') {
      this.logger.log('reminder cron disabled by env');
      return;
    }
    try {
      await this.run();
    } catch (error) {
      this.logger.error(`Maintenance reminder run crashed: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  async run(options: RunOptions = {}): Promise<RunSummary> {
    const dryRun = options.dryRun ?? false;
    const now = options.today ?? new Date();
    const today = startOfDay(now);
    const summary: RunSummary = {
      dryRun,
      today: today.toLocaleDateString('sv-SE'),
      carsScanned: 0,
      itemsConsidered: 0,
      carsWithStaleMileage: 0,
      inApp: 0,
      push: 0,
      emailSent: 0,
      emailFailed: 0,
      failures: 0,
      candidates: [],
    };
    this.logger.log(`Maintenance reminder run started (today=${summary.today}, dryRun=${dryRun})`);

    // Loaded once for the whole run — orgs with 'maintenance' off don't get reminded.
    const disabledOrgIds = await this.featureAccess.disabledOrgIds('maintenance');

    const allCars = (await this.prisma.car.findMany({
      where: { status: CarStatus.ACTIVE, maintenanceRecords: { some: {} } },
      include: {
        user: { include: { settings: true } },
        access_entries: { where: { accepted_at: { not: null } }, include: { user: { include: { settings: true } } } },
        maintenanceRecords: true,
      },
    })) as CarWithRecipients[];
    const cars = allCars.filter(car => car.organization_id == null || !disabledOrgIds.has(car.organization_id));
    summary.carsScanned = cars.length;
    const carIds = cars.map(c => c.id);

    const nicknameRows = await this.prisma.carUserNickname.findMany({ where: { car_id: { in: carIds } } });
    const nicknames = new Map(nicknameRows.map(r => [`${r.car_id}:${r.user_id}`, r.nickname]));

    // Categories a user switched off in the Plan ("tracked = false", any profile) — maintenance has no
    // CarDeadlineOrder dismissal (that is documents only), tracked=false is its dismissal.
    const untrackedRows = await this.prisma.carMaintenanceSetting.findMany({ where: { car_id: { in: carIds }, tracked: false } });
    const untracked = new Map<string, typeof untrackedRows>();
    for (const row of untrackedRows) {
      const k = `${row.car_id}:${row.user_id}`;
      untracked.set(k, [...(untracked.get(k) ?? []), row]);
    }

    const sentRows = await this.prisma.maintenanceReminderSent.findMany({ where: { car_id: { in: carIds } } });
    const snoozeRows = await this.prisma.reminderSnooze.findMany({
      where: { kind: { in: ['MAINTENANCE_PLAN', 'MAINTENANCE_RECORD'] }, car_id: { in: carIds } },
    });
    const ctx: RunContext = {
      summary,
      nicknames,
      mutes: new Map((await this.prisma.carReminderMute.findMany({ where: { car_id: { in: carIds } } })).map(r => [carMuteMapKey(r.user_id, r.car_id), r])),
      now,
      snoozes: new Map(snoozeRows.map(r => [snoozeMapKey(r.user_id, r.kind, r.item_key), r])),
      sent: new Map(sentRows.map(r => [`${r.user_id}:${r.car_id}:${r.key}`, r])),
    };

    for (const car of cars) {
      const odometer = this.freshOdometer(car, now);
      if ((car.actual_mileage ?? car.current_mileage) != null && odometer == null) summary.carsWithStaleMileage++;
      const records: PlanRecordInput[] = car.maintenanceRecords.map(r => ({
        id: r.id,
        service_category: r.service_category,
        service_date: r.service_date,
        mileage: r.mileage,
      }));

      for (const user of uniqueRecipients(car).filter(u => options.onlyUserId == null || u.id === options.onlyUserId)) {
        if (!(user.settings?.maintenance_reminders_enabled ?? true)) continue;
        if (isCarMuted(ctx.mutes.get(carMuteMapKey(user.id, car.id)), now)) continue;
        const carLabel = reminderCarLabel(car, nicknames.get(`${car.id}:${user.id}`));
        const items = computePlanDueItems({ odometer, records, settings: untracked.get(`${car.id}:${user.id}`), now });
        summary.itemsConsidered += items.length;

        for (const item of items) {
          try {
            await this.handlePlanItem(ctx, user, car, carLabel, item, today);
          } catch (error) {
            summary.failures++;
            this.logger.error(
              `Plan reminder failed (user ${user.id}, car ${car.id}, ${item.category}): ${(error as Error).message}`,
              (error as Error).stack,
            );
          }
        }

        const reminderDays = user.settings?.expiry_reminder_days ?? DEFAULT_REMINDER_DAYS;
        for (const record of car.maintenanceRecords) {
          if (!record.expiry_date) continue;
          const daysLeft = Math.round((startOfDay(record.expiry_date).getTime() - today.getTime()) / MS_PER_DAY);
          const snooze = ctx.snoozes.get(snoozeMapKey(user.id, 'MAINTENANCE_RECORD', String(record.id)));
          const snoozed = snoozeState(snooze, today);
          if (snoozed === 'silent') continue;
          const snoozeEnded = snoozed === 'ended' && daysLeft >= -SNOOZE_END_MAX_DAYS_PAST;
          if (!snoozeEnded) {
            if (daysLeft < EXPIRED_OFFSET) continue;
            if (daysLeft !== EXPIRED_OFFSET && !reminderDays.includes(daysLeft)) continue;
          }
          summary.itemsConsidered++;
          try {
            await this.handleRecordDate(ctx, user, car, carLabel, record, daysLeft, snoozeEnded ? (snooze as ReminderSnooze) : undefined);
          } catch (error) {
            summary.failures++;
            this.logger.error(
              `Record-date reminder failed (user ${user.id}, car ${car.id}, record ${record.id}): ${(error as Error).message}`,
              (error as Error).stack,
            );
          }
        }
      }
    }

    await this.retryFailedEmails(ctx, options.onlyUserId);

    this.logger.log(
      `Maintenance reminder run finished (dryRun=${dryRun}): cars=${summary.carsScanned} items=${summary.itemsConsidered} ` +
        `staleMileageCars=${summary.carsWithStaleMileage} candidates=${summary.candidates.filter(c => c.action !== 'already-sent').length} ` +
        `inApp=${summary.inApp} push=${summary.push} emailSent=${summary.emailSent} ` +
        `emailFailed=${summary.emailFailed} failures=${summary.failures}`,
    );
    return summary;
  }

  /**
   * The odometer reading to use, or null when it can't be trusted: the freshest signal is the
   * newer of `actual_mileage_updated_at` and the newest record carrying a mileage; if that is
   * older than 60 days (or there is none) km are ignored and the decision is by date only.
   */
  private freshOdometer(car: CarWithRecipients, now: Date): number | null {
    const odometer = car.actual_mileage ?? car.current_mileage ?? null;
    if (odometer == null) return null;
    const signals = [
      car.actual_mileage_updated_at?.getTime(),
      ...car.maintenanceRecords.filter(r => r.mileage != null).map(r => r.service_date.getTime()),
    ].filter((t): t is number => t != null);
    if (!signals.length) return null;
    return now.getTime() - Math.max(...signals) > STALE_MILEAGE_DAYS * MS_PER_DAY ? null : odometer;
  }

  /** SOON / DUE once per cycle (cycle = the category's latest record), then OVERDUE every 30 days after DUE. */
  private async handlePlanItem(
    ctx: RunContext,
    user: UserWithSettings,
    car: CarWithRecipients,
    carLabel: string,
    item: PlanDueItem,
    today: Date,
  ): Promise<void> {
    const daysToDue = item.nextDueDate
      ? Math.round((startOfDay(item.nextDueDate).getTime() - today.getTime()) / MS_PER_DAY)
      : null;
    const decision = decideStage(item, daysToDue);
    if (!decision) return;

    const snooze = ctx.snoozes.get(snoozeMapKey(user.id, 'MAINTENANCE_PLAN', planSnoozeKey(item.category, item.lastRecordId)));
    const snoozed = snoozeState(snooze, today);
    if (snoozed === 'silent') return;

    const base = `plan:${item.category}:${item.lastRecordId}`;
    const dueRow = ctx.sent.get(`${user.id}:${car.id}:${base}:DUE`);
    let stage: MaintenanceDueStage = decision.stage;
    let key = `${base}:${decision.stage}`;
    let overdueDays: number | undefined;

    if (snoozed === 'ended') {
      // Timed snooze elapsed and the item is still pending: ONE reminder now (the matching stage, even if
      // that stage was already sent or capped), then the normal cadence resumes. A marker row under the
      // normal key stops the same stage from being sent again tomorrow.
      let endPast = 0;
      if (decision.stage === 'DUE') {
        const dueSince = [dueRow?.created_at, item.nextDueDate && item.nextDueDate < today ? item.nextDueDate : null]
          .filter((d): d is Date => d != null)
          .reduce((a, b) => (a < b ? a : b), today);
        endPast = Math.round((today.getTime() - startOfDay(dueSince).getTime()) / MS_PER_DAY);
      }
      const endStage: MaintenanceDueStage = decision.stage === 'DUE' && endPast >= OVERDUE_STEP_DAYS ? 'OVERDUE' : decision.stage;
      const payload: ReminderPayload = {
        carId: car.id,
        carLabel,
        category: item.category,
        stage: endStage,
        soonBy: decision.soonBy,
        nextDueDate: item.nextDueDate ? item.nextDueDate.toISOString() : null,
        kmRemaining: item.kmRemaining,
        daysLeft: daysToDue,
        overdueDays: endStage === 'OVERDUE' ? endPast : undefined,
        recordId: item.lastRecordId,
        snoozeEnd: true,
      };
      await this.handleSnoozeEnd(ctx, user, car, `${base}:${endStage === 'OVERDUE' ? 'DUE' : endStage}`, payload, snooze as ReminderSnooze);
      return;
    }
    if (decision.stage === 'SOON' && dueRow) return; // already past SOON for this cycle
    if (decision.stage === 'DUE') {
      // Became due at the earlier of the passed due date and the first time a DUE was sent (km-based due has no date).
      const dueSince = [dueRow?.created_at, item.nextDueDate && item.nextDueDate < today ? item.nextDueDate : null]
        .filter((d): d is Date => d != null)
        .reduce((a, b) => (a < b ? a : b), today);
      const pastDays = Math.round((today.getTime() - startOfDay(dueSince).getTime()) / MS_PER_DAY);
      const action = decideDueAction(pastDays, !!dueRow);
      if (!action) return;
      if (action.stage === 'OVERDUE') {
        stage = 'OVERDUE';
        key = `${base}:OVERDUE:${action.step}`;
        overdueDays = pastDays;
      }
    }

    const payload: ReminderPayload = {
      carId: car.id,
      carLabel,
      category: item.category,
      stage,
      soonBy: decision.soonBy,
      nextDueDate: item.nextDueDate ? item.nextDueDate.toISOString() : null,
      kmRemaining: item.kmRemaining,
      daysLeft: daysToDue,
      overdueDays,
      recordId: item.lastRecordId,
    };
    await this.handleReminder(ctx, user, car, key, payload);
  }

  /** A record's own user-entered reminder date: sent at the user's offsets plus the day after. */
  private async handleRecordDate(
    ctx: RunContext,
    user: UserWithSettings,
    car: CarWithRecipients,
    carLabel: string,
    record: MaintenanceRecord,
    daysLeft: number,
    endedSnooze?: ReminderSnooze,
  ): Promise<void> {
    const payload: ReminderPayload = {
      carId: car.id,
      carLabel,
      category: record.service_category,
      stage: 'EXPIRY',
      nextDueDate: (record.expiry_date as Date).toISOString(),
      kmRemaining: null,
      daysLeft,
      description: record.description,
      recordId: record.id,
    };
    if (endedSnooze) {
      await this.handleSnoozeEnd(ctx, user, car, `rec:${record.id}:${daysLeft}`, { ...payload, snoozeEnd: true }, endedSnooze);
      return;
    }
    await this.handleReminder(ctx, user, car, `rec:${record.id}:${daysLeft}`, payload);
  }

  /**
   * The single reminder after a timed snooze ended. Same send path as a normal reminder, with a dedup row
   * under `<key>:SNOOZE_END:<until date>` (email retry works as usual) plus a marker under the normal
   * `markerKey` so the normal cadence does not repeat this stage tomorrow; `end_notified_at` closes the snooze.
   */
  private async handleSnoozeEnd(
    ctx: RunContext,
    user: UserWithSettings,
    car: CarWithRecipients,
    markerKey: string,
    payload: ReminderPayload,
    snooze: ReminderSnooze,
  ): Promise<void> {
    const until = snooze.until ? snooze.until.toLocaleDateString('sv-SE') : 'none';
    const key = `${markerKey}:SNOOZE_END:${until}`;
    const before = ctx.summary.candidates.length;
    await this.handleReminder(ctx, user, car, key, payload);
    const cand = ctx.summary.candidates[before];
    if (cand && cand.action === 'send') cand.action = 'snooze-end';
    if (ctx.summary.dryRun) return;
    await this.prisma.reminderSnooze.update({ where: { id: snooze.id }, data: { end_notified_at: new Date() } });
    if (!ctx.sent.has(`${user.id}:${car.id}:${markerKey}`)) {
      try {
        const row = await this.prisma.maintenanceReminderSent.create({
          data: { user_id: user.id, car_id: car.id, key: markerKey, data: payload as unknown as Prisma.InputJsonValue, email_sent: true },
        });
        ctx.sent.set(`${user.id}:${car.id}:${markerKey}`, row);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      }
    }
  }

  /**
   * Fresh send: in-app notification (+ WebSocket, + always push) first, then the dedup row, then
   * email. Same ordering and retry semantics as DocumentRemindersService.
   */
  private async handleReminder(
    ctx: RunContext,
    user: UserWithSettings,
    car: CarWithRecipients,
    key: string,
    payload: ReminderPayload,
  ): Promise<void> {
    const { summary } = ctx;
    const existing = ctx.sent.get(`${user.id}:${car.id}:${key}`);
    summary.candidates.push({
      userId: user.id,
      email: user.email,
      carId: car.id,
      carLabel: payload.carLabel,
      category: payload.category as ServiceCategory,
      stage: payload.stage,
      key,
      daysLeft: payload.daysLeft ?? null,
      kmRemaining: payload.kmRemaining ?? null,
      overdueDays: payload.overdueDays ?? null,
      action: existing ? 'already-sent' : 'send',
    });
    // A pending email for an existing row is handled by retryFailedEmails.
    if (existing) return;

    const lang = reminderLang(user);
    if (summary.dryRun) {
      this.logger.log(
        `[dry-run] would notify user ${user.id} <${user.email}>: ${key} of car ${car.id} "${payload.carLabel}" ` +
          `(stage=${payload.stage}, daysLeft=${payload.daysLeft}, kmRemaining=${payload.kmRemaining}, lang=${lang})`,
      );
      return;
    }

    await this.notificationsService.create(user.id, 'MAINTENANCE_DUE', { ...payload, lang }, { forcePush: true });
    summary.inApp++;
    summary.push++;

    let row: MaintenanceReminderSent;
    try {
      row = await this.prisma.maintenanceReminderSent.create({
        data: { user_id: user.id, car_id: car.id, key, data: payload as unknown as Prisma.InputJsonValue, email_sent: false },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
    ctx.sent.set(`${user.id}:${car.id}:${key}`, row);
    await this.sendEmail(summary, row.id, user, payload);
  }

  private async sendEmail(summary: RunSummary, rowId: number, user: UserWithSettings, payload: ReminderPayload): Promise<void> {
    const ok = await this.mailService.sendMaintenanceDue(user.email, reminderLang(user), {
      ...payload,
      appUrl: this.configService.get<string>('FE_BASE_URL', 'http://localhost:4200'),
    });
    if (ok) {
      summary.emailSent++;
      await this.prisma.maintenanceReminderSent.update({ where: { id: rowId }, data: { email_sent: true } });
    } else {
      summary.emailFailed++;
    }
  }

  /** Re-sends only the email for reminders whose email failed earlier (notification/push already went out). */
  private async retryFailedEmails(ctx: RunContext, onlyUserId?: number): Promise<void> {
    const { summary } = ctx;
    const rows = await this.prisma.maintenanceReminderSent.findMany({
      where: { ...(onlyUserId != null ? { user_id: onlyUserId } : {}), email_sent: false, created_at: { gte: new Date(Date.now() - EMAIL_RETRY_DAYS * MS_PER_DAY) } },
      include: { user: { include: { settings: true } } },
    });
    for (const row of rows) {
      if (isCarMuted(ctx.mutes.get(carMuteMapKey(row.user_id, row.car_id)), ctx.now)) continue;
      const payload = row.data as unknown as ReminderPayload | null;
      if (!payload) continue;
      summary.candidates.push({
        userId: row.user_id,
        email: row.user.email,
        carId: row.car_id,
        carLabel: payload.carLabel,
        category: payload.category as ServiceCategory,
        stage: payload.stage,
        key: row.key,
        daysLeft: payload.daysLeft ?? null,
        kmRemaining: payload.kmRemaining ?? null,
        overdueDays: payload.overdueDays ?? null,
        action: 'retry-email',
      });
      if (summary.dryRun) {
        this.logger.log(`[dry-run] would retry email for reminder row ${row.id} (user ${row.user_id}, car ${row.car_id})`);
        continue;
      }
      try {
        await this.sendEmail(summary, row.id, row.user, payload);
      } catch (error) {
        summary.failures++;
        this.logger.error(`Email retry failed for reminder row ${row.id}: ${(error as Error).message}`);
      }
    }
  }
}
