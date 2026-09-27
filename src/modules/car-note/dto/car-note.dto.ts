import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CarNoteChecklistItemDto } from './car-note-checklist-item.dto';
import { NOTE_COLORS } from './car-note-constants';

export class CarNoteDto {
    @ApiProperty({ example: 1 })
    id: number;

    @ApiProperty({ example: 1 })
    car_id: number;

    @ApiProperty({ example: 'PIN casetofon' })
    title: string;

    @ApiProperty({ example: '1234, introdus de 3 ori la rând' })
    content: string;

    /** Legacy single group, superseded by `labels`. */
    @ApiPropertyOptional({ nullable: true, example: 'Recomandări' })
    group_name: string | null;

    @ApiProperty({ type: [String], example: ['Recomandări'] })
    labels: string[];

    @ApiProperty({ example: false })
    is_checklist: boolean;

    @ApiProperty({ example: false, description: 'Ticked checklist items keep their position instead of moving to the bottom.' })
    checked_in_place: boolean;

    @ApiProperty({ type: [CarNoteChecklistItemDto] })
    items: CarNoteChecklistItemDto[];

    @ApiPropertyOptional({ nullable: true, enum: NOTE_COLORS, example: 'mint' })
    color: string | null;

    @ApiProperty()
    created_at: Date;

    @ApiProperty()
    updated_at: Date;
}
