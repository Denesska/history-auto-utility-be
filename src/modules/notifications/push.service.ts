import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushPlatform } from '@prisma/client';
import { App, cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { resolve } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { MailLang, resolveMailLang } from '../mail/templates/base-email.template';
import { documentExpiringPushText } from '../mail/templates/document-expiring.template';
import { maintenanceDuePushText } from '../mail/templates/maintenance-due.template';
import { NotificationDto } from './dto/notification.dto';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly app: App | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const serviceAccountPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');

    if (!serviceAccountPath) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_PATH not set — push notifications disabled');
      this.app = null;
      return;
    }

    this.app = initializeApp({
      credential: cert(resolve(serviceAccountPath)),
    });
  }

  async registerToken(userId: number, token: string, platform: PushPlatform): Promise<void> {
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { user_id: userId, token, platform },
      update: { user_id: userId, platform },
    });
  }

  async sendToUser(userId: number, notification: NotificationDto): Promise<void> {
    if (!this.app) return;

    const tokens = await this.prisma.pushToken.findMany({ where: { user_id: userId } });
    if (tokens.length === 0) return;

    const { title, body } = await this.buildMessage(userId, notification);
    const data = {
      type: notification.type,
      notificationId: String(notification.id),
      payload: JSON.stringify(notification.data ?? {}),
    };

    const webTokens = tokens.filter(t => t.platform === PushPlatform.WEB);
    const androidTokens = tokens.filter(t => t.platform === PushPlatform.ANDROID);

    const staleTokens: string[] = [];

    // WEB: data-only. Including `notification` here makes Chrome auto-display the
    // message itself *in addition to* the manual showNotification() call in
    // firebase-messaging-sw.js's onBackgroundMessage handler, producing two
    // notifications for one push (the auto one has no click handler attached).
    if (webTokens.length > 0) {
      const response = await getMessaging(this.app).sendEachForMulticast({
        tokens: webTokens.map(t => t.token),
        data: { ...data, title, body },
      });
      this.logResult(notification, 'WEB', response);
      staleTokens.push(...this.collectStaleTokens(response, webTokens));
    }

    if (androidTokens.length > 0) {
      const response = await getMessaging(this.app).sendEachForMulticast({
        tokens: androidTokens.map(t => t.token),
        notification: { title, body },
        data,
      });
      this.logResult(notification, 'ANDROID', response);
      staleTokens.push(...this.collectStaleTokens(response, androidTokens));
    }

    if (staleTokens.length > 0) {
      await this.prisma.pushToken.deleteMany({ where: { token: { in: staleTokens } } });
    }
  }

  private logResult(
    notification: NotificationDto,
    platform: string,
    response: { successCount: number; failureCount: number; responses: { success: boolean; error?: { code?: string } }[] },
  ): void {
    const errors = response.responses.filter(r => !r.success).map(r => r.error?.code ?? 'unknown');
    this.logger.log(
      `FCM ${platform} push for notification ${notification.id}: ${response.successCount} ok, ${response.failureCount} failed` +
        (errors.length ? ` (${errors.join(', ')})` : ''),
    );
  }

  private collectStaleTokens(
    response: { responses: { success: boolean; error?: { code?: string } }[] },
    tokens: { token: string }[],
  ): string[] {
    return response.responses
      .map((r, i) => (!r.success && this.isInvalidTokenError(r.error?.code) ? tokens[i].token : null))
      .filter((t): t is string => t !== null);
  }

  private isInvalidTokenError(code?: string): boolean {
    return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';
  }

  /** Push text in the recipient's language: `data.lang` when the type sets it, otherwise looked up from UserSettings. */
  private async buildMessage(userId: number, notification: NotificationDto): Promise<{ title: string; body: string }> {
    const d = notification.data ?? {};
    let language: string | null | undefined = d.lang;
    if (!language) {
      const settings = await this.prisma.userSettings.findUnique({ where: { user_id: userId }, select: { language: true } });
      language = settings?.language;
    }
    const lang = resolveMailLang(language);

    if (notification.type === 'DOCUMENT_EXPIRING') {
      return documentExpiringPushText(lang, { carLabel: d.carLabel, docType: d.docType, daysLeft: d.daysLeft });
    }
    if (notification.type === 'MAINTENANCE_DUE') {
      return maintenanceDuePushText(lang, d);
    }

    const texts = PUSH_TEXTS[notification.type];
    if (!texts) return { ...FALLBACK_PUSH[lang] };
    return texts(lang, d);
  }
}

type PushText = { title: string; body: string };
type Localized = Record<MailLang, PushText>;

const FALLBACK_PUSH: Localized = {
  en: { title: 'New notification', body: '' },
  ro: { title: 'Notificare nouă', body: '' },
  ru: { title: 'Новое уведомление', body: '' },
};

/** Per-type push texts in en/ro/ru. DOCUMENT_EXPIRING and MAINTENANCE_DUE live with their mail templates. */
const PUSH_TEXTS: Partial<Record<string, (lang: MailLang, d: Record<string, any>) => PushText>> = {
  CAR_SHARED: (l, d) =>
    ({
      en: { title: 'Car shared', body: `${d.invitedByName} shared the car ${d.carLabel} with you` },
      ro: { title: 'Mașină partajată', body: `${d.invitedByName} ți-a partajat mașina ${d.carLabel}` },
      ru: { title: 'Автомобиль доступен вам', body: `${d.invitedByName} поделился с вами автомобилем ${d.carLabel}` },
    })[l],
  CAR_ACCESS_REMOVED: (l, d) =>
    ({
      en: { title: 'Access removed', body: `${d.removedByName} removed your access to the car ${d.carLabel}` },
      ro: { title: 'Acces eliminat', body: `${d.removedByName} ți-a eliminat accesul la mașina ${d.carLabel}` },
      ru: { title: 'Доступ удалён', body: `${d.removedByName} удалил ваш доступ к автомобилю ${d.carLabel}` },
    })[l],
  CAR_ACCESS_ROLE_CHANGED: (l, d) =>
    ({
      en: { title: 'Role updated', body: `${d.changedByName} changed your role for the car ${d.carLabel}` },
      ro: { title: 'Rol actualizat', body: `${d.changedByName} ți-a schimbat rolul la mașina ${d.carLabel}` },
      ru: { title: 'Роль обновлена', body: `${d.changedByName} изменил вашу роль для автомобиля ${d.carLabel}` },
    })[l],
  CAR_ACCESS_ACCEPTED: (l, d) =>
    ({
      en: { title: 'Invitation accepted', body: `${d.acceptedByName} accepted the invitation to the car ${d.carLabel}` },
      ro: { title: 'Invitație acceptată', body: `${d.acceptedByName} a acceptat invitația la mașina ${d.carLabel}` },
      ru: { title: 'Приглашение принято', body: `${d.acceptedByName} принял приглашение к автомобилю ${d.carLabel}` },
    })[l],
  VIN_CONFLICT: (l, d) =>
    ({
      en: { title: 'VIN conflict', body: `Another user tried to add a car with the same VIN as ${d.carLabel}` },
      ro: { title: 'Conflict de VIN', body: `Un alt utilizator a încercat să adauge o mașină cu același VIN ca ${d.carLabel}` },
      ru: { title: 'Конфликт VIN', body: `Другой пользователь попытался добавить автомобиль с тем же VIN, что и ${d.carLabel}` },
    })[l],
  LICENSE_PLATE_CONFLICT: (l, d) =>
    ({
      en: { title: 'License plate conflict', body: `Another user tried to add a car with the same license plate as ${d.carLabel}` },
      ro: { title: 'Conflict de număr de înmatriculare', body: `Un alt utilizator a încercat să adauge o mașină cu același număr ca ${d.carLabel}` },
      ru: { title: 'Конфликт госномера', body: `Другой пользователь попытался добавить автомобиль с тем же номером, что и ${d.carLabel}` },
    })[l],
  ORG_INVITED: (l, d) =>
    ({
      en: { title: 'Organization invitation', body: `${d.invitedByName} invited you to ${d.organizationName}` },
      ro: { title: 'Invitație în organizație', body: `${d.invitedByName} te-a invitat în ${d.organizationName}` },
      ru: { title: 'Приглашение в организацию', body: `${d.invitedByName} пригласил вас в ${d.organizationName}` },
    })[l],
  ORG_INVITE_ACCEPTED: (l, d) =>
    ({
      en: { title: 'Invitation accepted', body: `${d.acceptedByName} joined ${d.organizationName}` },
      ro: { title: 'Invitație acceptată', body: `${d.acceptedByName} s-a alăturat organizației ${d.organizationName}` },
      ru: { title: 'Приглашение принято', body: `${d.acceptedByName} присоединился к организации ${d.organizationName}` },
    })[l],
  BUSINESS_ACCESS_REQUESTED: (l, d) =>
    ({
      en: { title: 'Business account request', body: `${d.userName || d.userEmail} requested a business account for ${d.company_name}` },
      ro: { title: 'Cerere cont business', body: `${d.userName || d.userEmail} a cerut un cont business pentru ${d.company_name}` },
      ru: { title: 'Запрос бизнес-аккаунта', body: `${d.userName || d.userEmail} запросил бизнес-аккаунт для ${d.company_name}` },
    })[l],
  BUSINESS_ACCESS_APPROVED: (l, d) =>
    ({
      en: { title: 'Business account approved', body: `Your request for ${d.company_name} was approved` },
      ro: { title: 'Cont business aprobat', body: `Cererea ta pentru ${d.company_name} a fost aprobată` },
      ru: { title: 'Бизнес-аккаунт одобрен', body: `Ваш запрос для ${d.company_name} одобрен` },
    })[l],
  BUSINESS_ACCESS_REJECTED: (l, d) =>
    ({
      en: { title: 'Business account rejected', body: `Your request for ${d.company_name} was rejected` },
      ro: { title: 'Cont business respins', body: `Cererea ta pentru ${d.company_name} a fost respinsă` },
      ru: { title: 'Бизнес-аккаунт отклонён', body: `Ваш запрос для ${d.company_name} отклонён` },
    })[l],
  AI_QUOTA_BLOCKED: (l, d) => {
    const who = d.userName || d.userEmail;
    return {
      en: { title: 'AI limit reached', body: `${who || 'A user'} was blocked (${d.reason}) at ${d.feature}` },
      ro: { title: 'Limită AI atinsă', body: `${who || 'Un utilizator'} a fost blocat (${d.reason}) la ${d.feature}` },
      ru: { title: 'Достигнут лимит ИИ', body: `${who || 'Пользователь'} заблокирован (${d.reason}) в ${d.feature}` },
    }[l];
  },
};
