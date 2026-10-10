import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CarAccessService } from '../car-access/car-access.service';
import { SessionContext } from '../../common/context/session-context';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { UserSettingsDto } from './dto/user-settings.dto';
import { UpdateNavigationPrefsDto } from './dto/update-navigation-prefs.dto';
import { NavigationPrefsDto } from './dto/navigation-prefs.dto';

const DEFAULT_SETTINGS = {
    language: 'en',
    theme: 'auto',
    view_mode: 'cards',
    expiry_reminders_enabled: true,
    expiry_reminder_days: [7],
};

/** One entry of `UserSettings.navigation_prefs`, keyed per session context. */
interface NavigationPrefsEntry {
    bottom_bar?: string[] | null;
    favorite_car_id?: number | null;
}

/**
 * The context key `navigation_prefs` is keyed by — `personal` for personal
 * sessions, `org:<orgId>` for business sessions with an organization picked.
 * Business sessions with no organization picked yet have no key at all: there
 * is nothing to read or write (see ACCOUNT-CONTEXT.md, "Navigation preferences").
 */
function navigationContextKey(ctx: SessionContext): string | null {
    if (ctx.type === 'personal') return 'personal';
    return ctx.orgId == null ? null : `org:${ctx.orgId}`;
}

@Injectable()
export class UserSettingsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly carAccessService: CarAccessService,
    ) {}

    async getSettings(userId: number): Promise<UserSettingsDto> {
        const settings = await this.prisma.userSettings.findUnique({ where: { user_id: userId } });
        if (!settings) {
            return { ...DEFAULT_SETTINGS, theme: null };
        }
        return {
            language: settings.language,
            theme: settings.theme,
            view_mode: settings.view_mode,
            expiry_reminders_enabled: settings.expiry_reminders_enabled,
            expiry_reminder_days: settings.expiry_reminder_days,
        };
    }

    async updateSettings(userId: number, dto: UpdateUserSettingsDto): Promise<UserSettingsDto> {
        const settings = await this.prisma.userSettings.upsert({
            where: { user_id: userId },
            create: { user_id: userId, ...DEFAULT_SETTINGS, ...dto },
            update: { ...dto },
        });
        return {
            language: settings.language,
            theme: settings.theme,
            view_mode: settings.view_mode,
            expiry_reminders_enabled: settings.expiry_reminders_enabled,
            expiry_reminder_days: settings.expiry_reminder_days,
        };
    }

    // ── navigation preferences (per session context) ───────────────────────

    /**
     * Also used by the bootstrap response so GET and the initial app load
     * share one resolution (including the stale-favorite-car check below).
     */
    async getNavigationPrefs(userId: number, ctx: SessionContext): Promise<NavigationPrefsDto> {
        const key = navigationContextKey(ctx);
        if (!key) return { bottom_bar: null, favorite_car_id: null };

        const settings = await this.prisma.userSettings.findUnique({ where: { user_id: userId } });
        const entry: NavigationPrefsEntry = ((settings?.navigation_prefs as any)?.[key]) ?? {};

        let favoriteCarId = entry.favorite_car_id ?? null;
        if (favoriteCarId != null && !(await this.canAccessCar(favoriteCarId, userId))) {
            // Car was deleted, sold, or access was revoked since it was saved —
            // don't surface a dangling id, just report "not set".
            favoriteCarId = null;
        }

        return {
            bottom_bar: entry.bottom_bar ?? null,
            favorite_car_id: favoriteCarId,
        };
    }

    async updateNavigationPrefs(
        userId: number,
        ctx: SessionContext,
        dto: UpdateNavigationPrefsDto,
    ): Promise<NavigationPrefsDto> {
        const key = navigationContextKey(ctx);
        if (!key) {
            throw new BadRequestException('Select an organization before saving navigation preferences');
        }

        if (dto.favorite_car_id != null && !(await this.canAccessCar(dto.favorite_car_id, userId))) {
            throw new BadRequestException('Car is not accessible in this context');
        }

        const settings = await this.prisma.userSettings.findUnique({ where: { user_id: userId } });
        const prefs: Record<string, NavigationPrefsEntry> = { ...((settings?.navigation_prefs as any) ?? {}) };
        const current: NavigationPrefsEntry = prefs[key] ?? {};
        const updated: NavigationPrefsEntry = { ...current };

        if ('bottom_bar' in dto) updated.bottom_bar = dto.bottom_bar ?? null;
        if ('favorite_car_id' in dto) updated.favorite_car_id = dto.favorite_car_id ?? null;
        prefs[key] = updated;

        await this.prisma.userSettings.upsert({
            where: { user_id: userId },
            create: { user_id: userId, ...DEFAULT_SETTINGS, navigation_prefs: prefs as object },
            update: { navigation_prefs: prefs as object },
        });

        return this.getNavigationPrefs(userId, ctx);
    }

    /**
     * Cheap existence+access check reusing the centralized car-access rules
     * (owner / accepted share in personal, membership/driver-assignment in
     * business) rather than re-implementing them here. `assertHasAccess`
     * throws (403/404) on anything that isn't accessible; both collapse to
     * "no" for our purposes.
     */
    private async canAccessCar(carId: number, userId: number): Promise<boolean> {
        try {
            await this.carAccessService.assertHasAccess(carId, userId);
            return true;
        } catch {
            return false;
        }
    }
}
