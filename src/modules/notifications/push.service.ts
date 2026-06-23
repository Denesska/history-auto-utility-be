import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushPlatform } from '@prisma/client';
import { App, cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { resolve } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
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

    const { title, body } = this.buildMessage(notification);
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
      staleTokens.push(...this.collectStaleTokens(response, webTokens));
    }

    if (androidTokens.length > 0) {
      const response = await getMessaging(this.app).sendEachForMulticast({
        tokens: androidTokens.map(t => t.token),
        notification: { title, body },
        data,
      });
      staleTokens.push(...this.collectStaleTokens(response, androidTokens));
    }

    if (staleTokens.length > 0) {
      await this.prisma.pushToken.deleteMany({ where: { token: { in: staleTokens } } });
    }
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

  private buildMessage(notification: NotificationDto): { title: string; body: string } {
    if (notification.type === 'CAR_SHARED') {
      return {
        title: 'Masină partajată',
        body: `${notification.data?.invitedByName} ți-a partajat masina ${notification.data?.carLabel}`,
      };
    }

    if (notification.type === 'CAR_ACCESS_REMOVED') {
      return {
        title: 'Acces eliminat',
        body: `${notification.data?.removedByName} ți-a eliminat accesul la masina ${notification.data?.carLabel}`,
      };
    }

    if (notification.type === 'CAR_ACCESS_ROLE_CHANGED') {
      return {
        title: 'Rol actualizat',
        body: `${notification.data?.changedByName} ți-a schimbat rolul la masina ${notification.data?.carLabel}`,
      };
    }

    if (notification.type === 'CAR_ACCESS_ACCEPTED') {
      return {
        title: 'Invitație acceptată',
        body: `${notification.data?.acceptedByName} a acceptat invitația la masina ${notification.data?.carLabel}`,
      };
    }

    return { title: 'Notificare nouă', body: '' };
  }
}
