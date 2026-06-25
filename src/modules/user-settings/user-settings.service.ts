import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { UserSettingsDto } from './dto/user-settings.dto';

const DEFAULT_SETTINGS = {
    language: 'en',
    theme: 'auto',
    view_mode: 'cards',
    expiry_reminders_enabled: true,
    expiry_reminder_days: [7],
};

@Injectable()
export class UserSettingsService {
    constructor(private readonly prisma: PrismaService) {}

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
}
