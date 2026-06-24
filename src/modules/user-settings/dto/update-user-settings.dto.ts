import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const LANGUAGES = ['en', 'ro'];
const THEMES = ['light', 'dark', 'auto'];
const VIEW_MODES = ['cards', 'list'];
const REMINDER_DAYS = [1, 7, 14, 30];

export class UpdateUserSettingsDto {
    @ApiPropertyOptional({ example: 'en', enum: LANGUAGES })
    @IsOptional()
    @IsString()
    @IsIn(LANGUAGES)
    readonly language?: string;

    @ApiPropertyOptional({ example: 'auto', enum: THEMES })
    @IsOptional()
    @IsString()
    @IsIn(THEMES)
    readonly theme?: string;

    @ApiPropertyOptional({ example: 'cards', enum: VIEW_MODES })
    @IsOptional()
    @IsString()
    @IsIn(VIEW_MODES)
    readonly view_mode?: string;

    @ApiPropertyOptional({ example: true })
    @IsOptional()
    @IsBoolean()
    readonly expiry_reminders_enabled?: boolean;

    @ApiPropertyOptional({ example: [7], enum: REMINDER_DAYS, isArray: true })
    @IsOptional()
    @IsArray()
    @IsIn(REMINDER_DAYS, { each: true })
    readonly expiry_reminder_days?: number[];
}
