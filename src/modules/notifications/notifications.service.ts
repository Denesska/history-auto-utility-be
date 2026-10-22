import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Notification, NotificationType } from '@prisma/client';
import { getRequestSessionContext } from '../../common/context/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { PushService } from './push.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly pushService: PushService,
  ) {}

  /**
   * `forcePush`: also send the push when the user has a live WebSocket (normally push is the
   * offline fallback only). Push failures are then logged and swallowed, since the notification
   * row is already saved and the caller must not treat the send as failed.
   */
  async create(
    userId: number,
    type: NotificationType,
    data: Record<string, any>,
    options: { forcePush?: boolean } = {},
  ): Promise<Notification> {
    const notification = await this.prisma.notification.create({
      data: { user_id: userId, type, data },
    });

    const connected = this.gateway.isUserConnected(userId);
    if (connected) this.gateway.emitToUser(userId, notification);

    if (!connected || options.forcePush) {
      if (options.forcePush) {
        try {
          await this.pushService.sendToUser(userId, notification);
        } catch (error) {
          this.logger.error(`Push failed for notification ${notification.id}: ${(error as Error).message}`);
        }
      } else {
        await this.pushService.sendToUser(userId, notification);
      }
    }

    return notification;
  }

  /** Upper bound of rows loaded before the per-context filter; the list itself is capped at 50 afterwards. */
  private static readonly CONTEXT_FILTER_FETCH_LIMIT = 500;

  /**
   * Notifications have no context column, so they're classified by type (and,
   * for car-bound types, by the car's `organization_id`):
   * - ORG_INVITED / ORG_INVITE_ACCEPTED: business only;
   * - CAR_SHARED / CAR_ACCESS_*: personal only (personal car sharing);
   * - DOCUMENT_EXPIRING / MAINTENANCE_DUE / VIN_CONFLICT / LICENSE_PLATE_CONFLICT: follow their
   *   car (personal if it has no organization, business if it belongs to the
   *   session's organization).
   * - BUSINESS_ACCESS_REQUESTED / BUSINESS_ACCESS_APPROVED / BUSINESS_ACCESS_REJECTED:
   *   account-level, not org-bound — visible in any context (personal or business).
   * - AI_QUOTA_BLOCKED: app-admin only, account-level — visible in any context.
   * Outside an HTTP request (no context) nothing is filtered.
   */
  private async filterForContext<T extends { type: NotificationType; data: unknown }>(rows: T[]): Promise<T[]> {
    const ctx = getRequestSessionContext();
    if (!ctx) return rows;

    const carBound: NotificationType[] = [
      NotificationType.DOCUMENT_EXPIRING,
      NotificationType.MAINTENANCE_DUE,
      NotificationType.VIN_CONFLICT,
      NotificationType.LICENSE_PLATE_CONFLICT,
    ];
    const carIdOf = (r: T): number | null => {
      const id = (r.data as { carId?: unknown } | null)?.carId;
      return typeof id === 'number' ? id : null;
    };

    const carIds = [...new Set(rows.filter(r => carBound.includes(r.type)).map(carIdOf).filter((id): id is number => id !== null))];
    const cars = carIds.length
      ? await this.prisma.car.findMany({ where: { id: { in: carIds } }, select: { id: true, organization_id: true } })
      : [];
    const orgByCar = new Map(cars.map(c => [c.id, c.organization_id]));

    return rows.filter(r => {
      if (
        r.type === NotificationType.BUSINESS_ACCESS_REQUESTED ||
        r.type === NotificationType.BUSINESS_ACCESS_APPROVED ||
        r.type === NotificationType.BUSINESS_ACCESS_REJECTED ||
        r.type === NotificationType.AI_QUOTA_BLOCKED
      ) {
        return true;
      }
      if (r.type === NotificationType.ORG_INVITED || r.type === NotificationType.ORG_INVITE_ACCEPTED) {
        return ctx.type === 'business';
      }
      if (carBound.includes(r.type)) {
        const carId = carIdOf(r);
        const carOrg = carId !== null ? orgByCar.get(carId) ?? null : null;
        return ctx.type === 'business' ? carOrg !== null && carOrg === ctx.orgId : carOrg === null;
      }
      return ctx.type === 'personal';
    });
  }

  async findForUser(userId: number, unreadOnly = false): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: { user_id: userId, ...(unreadOnly ? { read_at: null } : {}) },
      orderBy: { created_at: 'desc' },
      take: NotificationsService.CONTEXT_FILTER_FETCH_LIMIT,
    });
    return (await this.filterForContext(rows)).slice(0, 50);
  }

  async countUnread(userId: number): Promise<number> {
    const rows = await this.prisma.notification.findMany({
      where: { user_id: userId, read_at: null },
      select: { type: true, data: true },
    });
    return (await this.filterForContext(rows)).length;
  }

  async markAsRead(userId: number, id: number): Promise<Notification> {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.user_id !== userId) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.read_at) return notification;

    return this.prisma.notification.update({
      where: { id },
      data: { read_at: new Date() },
    });
  }

  async markAllAsRead(userId: number): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { user_id: userId, read_at: null },
      data: { read_at: new Date() },
    });
  }

  async delete(userId: number, id: number): Promise<void> {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.user_id !== userId) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.delete({ where: { id } });
  }

  // Only clears notifications already marked read — an unaccepted CAR_SHARED
  // invite is never marked read until acted on, so it's never swept up here.
  async clearRead(userId: number): Promise<void> {
    await this.prisma.notification.deleteMany({
      where: { user_id: userId, read_at: { not: null } },
    });
  }
}
