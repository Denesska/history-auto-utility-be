import { IsString, IsOptional, IsNumber } from 'class-validator';
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
    @IsNumber()
    @ApiPropertyOptional({ example: 1, description: 'Quantity, can be fractional (e.g. liters of fluid)' })
    readonly quantity?: number;

    @IsOptional()
    @IsNumber()
    @ApiPropertyOptional({ example: 76 })
    readonly price?: number;
}
