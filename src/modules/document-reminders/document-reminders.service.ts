import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Car, CarStatus, DocumentExpiryType, Prisma, User, UserSettings } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailLang } from '../mail/templates/base-email.template';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

type UserWithSettings = User & { settings: UserSettings | null };

type CarWithRecipients = Car & {
  user: UserWithSettings;
  access_entries: { user: UserWithSettings }[];
};

const DOC_FIELDS: { type: DocumentExpiryType; field: 'rca_expiry_date' | 'itp_expiry_date' | 'rov_expiry_date' }[] = [
  { type: 'RCA', field: 'rca_expiry_date' },
  { type: 'ITP', field: 'itp_expiry_date' },
  { type: 'ROVINIETA', field: 'rov_expiry_date' },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  ) {}

  @Cron('0 8 * * *')
  async checkExpiringDocuments(): Promise<void> {
    const cars = (await this.prisma.car.findMany({
      where: {
        status: CarStatus.ACTIVE,
        OR: [
          { rca_expiry_date: { not: null } },
          { itp_expiry_date: { not: null } },
          { rov_expiry_date: { not: null } },
        ],
      },
      include: {
        user: { include: { settings: true } },
        access_entries: {
          where: { accepted_at: { not: null } },
          include: { user: { include: { settings: true } } },
        },
      },
    })) as CarWithRecipients[];

    const today = startOfDay(new Date());

    for (const car of cars) {
      const carLabel = car.nickname ?? `${car.make} ${car.model}`.trim();
      const recipients = this.uniqueRecipients(car);

      for (const { type, field } of DOC_FIELDS) {
        const expiresAt = car[field];
        if (!expiresAt) continue;

        const daysLeft = Math.round((startOfDay(expiresAt).getTime() - today.getTime()) / MS_PER_DAY);
        if (daysLeft < 0) continue;

        for (const recipient of recipients) {
          await this.maybeSendReminder(recipient, car.id, carLabel, type, expiresAt, daysLeft);
        }
      }
    }
  }

  private uniqueRecipients(car: CarWithRecipients): UserWithSettings[] {
    const byId = new Map<number, UserWithSettings>();
    byId.set(car.user.id, car.user);
    for (const entry of car.access_entries) {
      byId.set(entry.user.id, entry.user);
    }
    return [...byId.values()];
  }

  private async maybeSendReminder(
    user: UserWithSettings,
    carId: number,
    carLabel: string,
    docType: DocumentExpiryType,
    expiresAt: Date,
    daysLeft: number,
  ): Promise<void> {
    const remindersEnabled = user.settings?.expiry_reminders_enabled ?? true;
    const reminderDays = user.settings?.expiry_reminder_days ?? [7];
    if (!remindersEnabled || !reminderDays.includes(daysLeft)) return;

    const isFirstSend = await this.recordReminderSent(user.id, carId, docType, expiresAt, daysLeft);
    if (!isFirstSend) return;

    await this.notificationsService.create(user.id, 'DOCUMENT_EXPIRING', {
      carId,
      carLabel,
      docType,
      expiresAt,
      daysLeft,
    });

    const lang: MailLang = user.settings?.language === 'en' ? 'en' : 'ro';
    await this.mailService.sendDocumentExpiring(user.email, lang, {
      carLabel,
      docType,
      expiresAt,
      daysLeft,
      appUrl: this.configService.get<string>('FE_BASE_URL', 'http://localhost:4200'),
    });
  }

  /** Inserts the dedup row; returns false (no-op) if this exact reminder was already sent. */
  private async recordReminderSent(
    userId: number,
    carId: number,
    docType: DocumentExpiryType,
    expiryDate: Date,
    daysBefore: number,
  ): Promise<boolean> {
    try {
      await this.prisma.documentReminderSent.create({
        data: { user_id: userId, car_id: carId, doc_type: docType, expiry_date: expiryDate, days_before: daysBefore },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      this.logger.error(`Failed to record reminder for user ${userId}, car ${carId}: ${(error as Error).message}`);
      throw error;
    }
  }
}
