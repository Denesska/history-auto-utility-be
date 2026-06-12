import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { UserSettingsDto } from './dto/user-settings.dto';

const DEFAULT_SETTINGS = { language: 'en', theme: 'auto', view_mode: 'cards' };

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
        };
    }
}
