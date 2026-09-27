import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CarNoteChecklistItemDto } from './car-note-checklist-item.dto';
import { NOTE_COLORS, NOTE_LABEL_MAX_LENGTH, NOTE_MAX_ITEMS, NOTE_MAX_LABELS } from './car-note-constants';

export class CreateCarNoteDto {
    @ApiProperty({ example: 1 })
    @IsInt()
    readonly car_id: number;

    @ApiProperty({ example: 'PIN casetofon' })
    @IsString()
    readonly title: string;

    /** Defaults to "" — checklist notes have no free-text content. */
    @ApiPropertyOptional({ example: '1234, introdus de 3 ori la rând' })
    @IsOptional()
    @IsString()
    readonly content?: string;

    /** Legacy — kept for backward compatibility; prefer `labels`. */
    @ApiPropertyOptional({ example: 'Recomandări' })
    @IsOptional()
    @IsString()
    readonly group_name?: string;

    @ApiPropertyOptional({ type: [String], example: ['Recomandări', 'Iarnă'] })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(NOTE_MAX_LABELS)
    @IsString({ each: true })
    @MaxLength(NOTE_LABEL_MAX_LENGTH, { each: true })
    readonly labels?: string[];

    @ApiPropertyOptional({ example: false })
    @IsOptional()
    @IsBoolean()
    readonly is_checklist?: boolean;

    @ApiPropertyOptional({ example: false })
    @IsOptional()
    @IsBoolean()
    readonly checked_in_place?: boolean;

    @ApiPropertyOptional({ type: [CarNoteChecklistItemDto] })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(NOTE_MAX_ITEMS)
    @ValidateNested({ each: true })
    @Type(() => CarNoteChecklistItemDto)
    readonly items?: CarNoteChecklistItemDto[];

    /** Palette key; explicit null clears the color. */
    @ApiPropertyOptional({ nullable: true, enum: NOTE_COLORS, example: 'mint' })
    @ValidateIf(o => o.color !== null && o.color !== undefined)
    @IsIn(NOTE_COLORS as unknown as string[])
    readonly color?: string | null;
}
