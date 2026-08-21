import { Injectable, NotFoundException } from '@nestjs/common';
import { Notification, NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { PushService } from './push.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly pushService: PushService,
  ) {}

  async create(userId: number, type: NotificationType, data: Record<string, any>): Promise<Notification> {
    const notification = await this.prisma.notification.create({
      data: { user_id: userId, type, data },
    });

    if (this.gateway.isUserConnected(userId)) {
      this.gateway.emitToUser(userId, notification);
    } else {
      await this.pushService.sendToUser(userId, notification);
    }

    return notification;
  }

  async findForUser(userId: number, unreadOnly = false): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { user_id: userId, ...(unreadOnly ? { read_at: null } : {}) },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }

  async countUnread(userId: number): Promise<number> {
    return this.prisma.notification.count({
      where: { user_id: userId, read_at: null },
    });
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
