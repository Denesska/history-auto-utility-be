import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Car, CarStatus, Document, Prisma, User, UserSettings } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailLang } from '../mail/templates/base-email.template';
import { normalizeDocKind } from '../mail/templates/document-expiring.template';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FeatureAccessService } from '../../common/features/feature-access.service';

type UserWithSettings = User & { settings: UserSettings | null };

type CarWithRecipients = Car & {
  user: UserWithSettings;
  access_entries: { user: UserWithSettings }[];
  documents: Document[];
};

/** Default "before expiry" offsets when the user has no settings row. */
const DEFAULT_REMINDER_DAYS = [7, 3, 1, 0];
/** Sent once, the day after expiry, to every user with reminders enabled. */
const EXPIRED_OFFSET = -1;
/** A reminder whose email failed is retried for this many days after it was first sent. */
const EMAIL_RETRY_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RunOptions {
  /** Compute and log who would be notified; send and write nothing. */
  dryRun?: boolean;
  /** Pretend this is today (for verifying offsets). */
  today?: Date;
}

export interface ReminderCandidate {
  userId: number;
  email: string;
  carId: number;
  carLabel: string;
  docType: string;
  expiresAt: Date;
  daysLeft: number;
  action: 'send' | 'already-sent' | 'retry-email';
}

export interface RunSummary {
  dryRun: boolean;
  today: string;
  carsScanned: number;
  docsConsidered: number;
  inApp: number;
  push: number;
  emailSent: number;
  emailFailed: number;
  failures: number;
  candidates: ReminderCandidate[];
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class DocumentRemindersService {
  private readonly logger = new Logger(DocumentRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly featureAccess: FeatureAccessService,
  ) {}

  @Cron('0 8 * * *')
  async checkExpiringDocuments(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error(`Document reminder run crashed: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  async run(options: RunOptions = {}): Promise<RunSummary> {
    const dryRun = options.dryRun ?? false;
    const today = startOfDay(options.today ?? new Date());
    const summary: RunSummary = {
      dryRun,
      today: today.toLocaleDateString('sv-SE'),
      carsScanned: 0,
      docsConsidered: 0,
      inApp: 0,
      push: 0,
      emailSent: 0,
      emailFailed: 0,
      failures: 0,
      candidates: [],
    };
    this.logger.log(`Document reminder run started (today=${summary.today}, dryRun=${dryRun})`);

    // Loaded once for the whole run, not per car — orgs with 'documents' off don't get reminded.
    const disabledOrgIds = await this.featureAccess.disabledOrgIds('documents');

    const allCars = (await this.prisma.car.findMany({
      where: { status: CarStatus.ACTIVE, documents: { some: { is_active: true, expiry_date: { not: null } } } },
      include: {
        user: { include: { settings: true } },
        access_entries: {
          where: { accepted_at: { not: null } },
          include: { user: { include: { settings: true } } },
        },
        documents: { where: { is_active: true, expiry_date: { not: null } } },
      },
    })) as CarWithRecipients[];

    // Personal cars (organization_id null) are never skipped.
    const cars = allCars.filter(car => car.organization_id == null || !disabledOrgIds.has(car.organization_id));
    summary.carsScanned = cars.length;

    // One query for every recipient's private car label (see CarUserNickname).
    const nicknameRows = await this.prisma.carUserNickname.findMany({ where: { car_id: { in: cars.map(c => c.id) } } });
    const nicknames = new Map(nicknameRows.map(r => [`${r.car_id}:${r.user_id}`, r.nickname]));

    for (const car of cars) {
      const recipients = this.uniqueRecipients(car);
      for (const doc of this.currentDocuments(car.documents)) {
        summary.docsConsidered++;
        const expiresAt = doc.expiry_date as Date;
        const daysLeft = Math.round((startOfDay(expiresAt).getTime() - today.getTime()) / MS_PER_DAY);
        if (daysLeft < EXPIRED_OFFSET) continue;
        const docType = this.dedupType(doc);

        for (const user of recipients) {
          const remindersEnabled = user.settings?.expiry_reminders_enabled ?? true;
          const reminderDays = user.settings?.expiry_reminder_days ?? DEFAULT_REMINDER_DAYS;
          if (!remindersEnabled) continue;
          if (daysLeft !== EXPIRED_OFFSET && !reminderDays.includes(daysLeft)) continue;

          try {
            await this.handleReminder(
              summary,
              user,
              car,
              this.carLabel(car, nicknames.get(`${car.id}:${user.id}`)),
              docType,
              expiresAt,
              daysLeft,
            );
          } catch (error) {
            summary.failures++;
            this.logger.error(
              `Reminder failed (user ${user.id}, car ${car.id}, ${docType}, ${daysLeft}d): ${(error as Error).message}`,
              (error as Error).stack,
            );
          }
        }
      }
    }

    await this.retryFailedEmails(summary, nicknames);

    this.logger.log(
      `Document reminder run finished (dryRun=${dryRun}): cars=${summary.carsScanned} docs=${summary.docsConsidered} ` +
        `candidates=${summary.candidates.filter(c => c.action !== 'already-sent').length} ` +
        `inApp=${summary.inApp} push=${summary.push} emailSent=${summary.emailSent} ` +
        `emailFailed=${summary.emailFailed} failures=${summary.failures}`,
    );
    return summary;
  }

  /**
   * Fresh send: in-app notification (which also delivers over WebSocket, or push when the
   * user has no live socket) first, then the dedup row, then email. The row is written only
   * once the notification went out and carries `email_sent` — so a failed email is retried
   * (email only) by retryFailedEmails without re-sending the notification/push.
   */
  private async handleReminder(
    summary: RunSummary,
    user: UserWithSettings,
    car: CarWithRecipients,
    carLabel: string,
    docType: string,
    expiresAt: Date,
    daysLeft: number,
  ): Promise<void> {
    const existing = await this.prisma.documentReminderSent.findUnique({
      where: {
        user_id_car_id_doc_type_expiry_date_days_before: {
          user_id: user.id,
          car_id: car.id,
          doc_type: docType,
          expiry_date: expiresAt,
          days_before: daysLeft,
        },
      },
    });
    const candidate: ReminderCandidate = {
      userId: user.id,
      email: user.email,
      carId: car.id,
      carLabel,
      docType,
      expiresAt,
      daysLeft,
      action: existing ? 'already-sent' : 'send',
    };
    summary.candidates.push(candidate);
    // A pending email for an existing row is handled by retryFailedEmails.
    if (existing) return;

    if (summary.dryRun) {
      this.logger.log(
        `[dry-run] would notify user ${user.id} <${user.email}>: ${docType} of car ${car.id} "${carLabel}" ` +
          `expires ${expiresAt.toISOString().slice(0, 10)} (daysLeft=${daysLeft}, lang=${this.lang(user)})`,
      );
      return;
    }

    const lang = this.lang(user);
    await this.notificationsService.create(user.id, 'DOCUMENT_EXPIRING', {
      carId: car.id,
      carLabel,
      docType: normalizeDocKind(docType.split(':')[0]),
      docTypeRaw: docType,
      expiresAt,
      daysLeft,
      lang,
    }, { forcePush: true }); // phone push even if a desktop tab holds a WebSocket; push errors are swallowed inside create
    summary.inApp++;
    summary.push++;

    let row;
    try {
      row = await this.prisma.documentReminderSent.create({
        data: {
          user_id: user.id,
          car_id: car.id,
          doc_type: docType,
          expiry_date: expiresAt,
          days_before: daysLeft,
          email_sent: false,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
    await this.sendEmail(summary, row.id, user, carLabel, docType, expiresAt, daysLeft);
  }

  private async sendEmail(
    summary: RunSummary,
    rowId: number,
    user: UserWithSettings,
    carLabel: string,
    docType: string,
    expiresAt: Date,
    daysLeft: number,
  ): Promise<void> {
    const ok = await this.mailService.sendDocumentExpiring(user.email, this.lang(user), {
      carLabel,
      docType: docType.split(':')[0],
      expiresAt,
      daysLeft,
      appUrl: this.configService.get<string>('FE_BASE_URL', 'http://localhost:4200'),
    });
    if (ok) {
      summary.emailSent++;
      await this.prisma.documentReminderSent.update({ where: { id: rowId }, data: { email_sent: true } });
    } else {
      summary.emailFailed++;
    }
  }

  /** Re-sends only the email for reminders whose email failed earlier (notification/push already went out). */
  private async retryFailedEmails(summary: RunSummary, nicknames: Map<string, string>): Promise<void> {
    const rows = await this.prisma.documentReminderSent.findMany({
      where: { email_sent: false, sent_at: { gte: new Date(Date.now() - EMAIL_RETRY_DAYS * MS_PER_DAY) } },
      include: { user: { include: { settings: true } }, car: true },
    });
    for (const row of rows) {
      const carLabel = this.carLabel(row.car, nicknames.get(`${row.car_id}:${row.user_id}`));
      summary.candidates.push({
        userId: row.user_id,
        email: row.user.email,
        carId: row.car_id,
        carLabel,
        docType: row.doc_type,
        expiresAt: row.expiry_date,
        daysLeft: row.days_before,
        action: 'retry-email',
      });
      if (summary.dryRun) {
        this.logger.log(`[dry-run] would retry email for reminder row ${row.id} (user ${row.user_id}, car ${row.car_id})`);
        continue;
      }
      try {
        await this.sendEmail(summary, row.id, row.user, carLabel, row.doc_type, row.expiry_date, row.days_before);
      } catch (error) {
        summary.failures++;
        this.logger.error(`Email retry failed for reminder row ${row.id}: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Latest-expiring active document per type (a renewed doc supersedes older ones). Vignettes are
   * kept per country — a foreign vignette must not hide the home (RO) one.
   */
  private currentDocuments(docs: Document[]): Document[] {
    const latest = new Map<string, Document>();
    for (const doc of docs) {
      if (!doc.expiry_date) continue;
      const key = this.dedupType(doc);
      const prev = latest.get(key);
      if (!prev || (prev.expiry_date as Date) < doc.expiry_date) latest.set(key, doc);
    }
    return [...latest.values()];
  }

  /** 'RCA', 'ITP', 'ROV' (home vignette), 'ROV:DE' (foreign vignette), 'CASCO', ... */
  private dedupType(doc: Document): string {
    const type = doc.document_type === 'ROVINIETA' ? 'ROV' : doc.document_type;
    return type === 'ROV' && doc.country && doc.country !== 'RO' ? `ROV:${doc.country}` : type;
  }

  private carLabel(car: Pick<Car, 'make' | 'model' | 'license_plate'>, nickname: string | undefined): string {
    const name = nickname ?? `${car.make} ${car.model}`.trim();
    return car.license_plate ? `${name} (${car.license_plate})` : name;
  }

  private lang(user: UserWithSettings): MailLang {
    return user.settings?.language === 'en' ? 'en' : 'ro';
  }

  private uniqueRecipients(car: CarWithRecipients): UserWithSettings[] {
    const byId = new Map<number, UserWithSettings>();
    byId.set(car.user.id, car.user);
    for (const entry of car.access_entries) {
      byId.set(entry.user.id, entry.user);
    }
    return [...byId.values()];
  }
}
