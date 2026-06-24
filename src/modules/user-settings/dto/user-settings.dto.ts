import { ApiProperty } from '@nestjs/swagger';

export class UserSettingsDto {
    @ApiProperty({ example: 'en' })
    language: string;

    @ApiProperty({ example: 'auto', nullable: true, description: 'Null when the user has never saved theme preferences.' })
    theme: string | null;

    @ApiProperty({ example: 'cards' })
    view_mode: string;

    @ApiProperty({ example: true })
    expiry_reminders_enabled: boolean;

    @ApiProperty({ example: [7], isArray: true })
    expiry_reminder_days: number[];
}
