import { IsString, IsOptional, IsInt, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MaintenancePartInputDto {
    @IsString()
    @ApiProperty({ example: 'Garnitura baie ulei' })
    readonly name: string;

    @IsOptional()
    @IsString()
    @ApiPropertyOptional({ example: 'ABC-123' })
    readonly code?: string;

    @IsOptional()
    @IsInt()
    @ApiPropertyOptional({ example: 1 })
    readonly quantity?: number;

    @IsOptional()
    @IsNumber()
    @ApiPropertyOptional({ example: 76 })
    readonly price?: number;
}
