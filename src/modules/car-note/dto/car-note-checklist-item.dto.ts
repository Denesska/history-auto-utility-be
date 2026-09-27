import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, MaxLength } from 'class-validator';
import { NOTE_ITEM_TEXT_MAX_LENGTH } from './car-note-constants';

export class CarNoteChecklistItemDto {
    @ApiProperty({ example: 'Schimb ulei' })
    @IsString()
    @MaxLength(NOTE_ITEM_TEXT_MAX_LENGTH)
    text: string;

    @ApiProperty({ example: false })
    @IsBoolean()
    checked: boolean;
}
