import { ApiProperty } from '@nestjs/swagger';

export class UserSettingsDto {
    @ApiProperty({ example: 'en' })
    language: string;

    @ApiProperty({ example: 'auto' })
    theme: string;

    @ApiProperty({ example: 'cards' })
    view_mode: string;
}
