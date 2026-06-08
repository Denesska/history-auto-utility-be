import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const LANGUAGES = ['en', 'ro'];
const THEMES = ['light', 'dark', 'auto'];
const VIEW_MODES = ['cards', 'list'];

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
}
