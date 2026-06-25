import { IsString, IsInt, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCarNoteDto {
    @ApiProperty({ example: 1 })
    @IsInt()
    readonly car_id: number;

    @ApiProperty({ example: 'PIN casetofon' })
    @IsString()
    readonly title: string;

    @ApiProperty({ example: '1234, introdus de 3 ori la rând' })
    @IsString()
    readonly content: string;

    @ApiPropertyOptional({ example: 'Recomandări' })
    @IsOptional()
    @IsString()
    readonly group_name?: string;
}
