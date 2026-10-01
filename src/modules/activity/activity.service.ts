import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { localDay } from './activity-date.util';

export type ClientPlatform = 'ios' | 'android' | 'web';

interface PendingDay {
  userId: number;
  day: string;
  requests: number;
  firstSeen: Date;
  lastSeen: Date;
  platform: ClientPlatform | null;
  appVersion: string | null;
}

/**
 * Records "this user was active today" for the admin stats page.
 *
 * Hits are buffered in memory and flushed once a minute, so tracking costs
 * one Map write per request instead of a DB round-trip. Losing up to a
 * minute of counts on a restart is acceptable — the day row itself is
 * recreated on the user's next request.
 */
@Injectable()
export class ActivityService implements OnModuleDestroy {
  private readonly _logger = new Logger(ActivityService.name);
  private _pending = new Map<string, PendingDay>();

  constructor(private readonly prisma: PrismaService) {}

  record(userId: number, platform: ClientPlatform | null, appVersion: string | null): void {
    const now = new Date();
    const day = localDay(now);
    const key = `${userId}:${day}`;
    const entry = this._pending.get(key);
    if (entry) {
      entry.requests++;
      entry.lastSeen = now;
      entry.platform = platform ?? entry.platform;
      entry.appVersion = appVersion ?? entry.appVersion;
    } else {
      this._pending.set(key, { userId, day, requests: 1, firstSeen: now, lastSeen: now, platform, appVersion });
    }
  }

  @Interval(60_000)
  async flush(): Promise<void> {
    if (this._pending.size === 0) return;
    const batch = [...this._pending.values()];
    this._pending = new Map();

    try {
      await this.prisma.$transaction([
        ...batch.map(e =>
          this.prisma.userActivityDay.upsert({
            where: { user_id_date: { user_id: e.userId, date: new Date(`${e.day}T00:00:00Z`) } },
            create: {
              user_id: e.userId,
              date: new Date(`${e.day}T00:00:00Z`),
              platform: e.platform,
              app_version: e.appVersion,
              request_count: e.requests,
              first_seen_at: e.firstSeen,
              last_seen_at: e.lastSeen,
            },
            update: {
              request_count: { increment: e.requests },
              last_seen_at: e.lastSeen,
              ...(e.platform ? { platform: e.platform } : {}),
              ...(e.appVersion ? { app_version: e.appVersion } : {}),
            },
          }),
        ),
        ...batch.map(e =>
          this.prisma.user.updateMany({
            where: { id: e.userId, OR: [{ last_active_at: null }, { last_active_at: { lt: e.lastSeen } }] },
            data: { last_active_at: e.lastSeen },
          }),
        ),
      ]);
    } catch (err) {
      // A user deleted between the hit and the flush fails the FK — drop the
      // batch rather than retrying forever; it's analytics, not data.
      this._logger.warn(`activity flush failed (${batch.length} entries dropped): ${(err as Error)?.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.flush();
  }
}
