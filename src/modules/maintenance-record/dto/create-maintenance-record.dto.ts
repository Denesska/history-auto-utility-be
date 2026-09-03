import { IsString, IsInt, IsNumber, IsEnum, IsOptional, IsDateString, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType } from '../../document/enum/service-type.enum';
import { ServiceCategory } from '../../document/enum/service-category.enum';
import { MaintenancePartInputDto } from './maintenance-part-input.dto';

export class CreateMaintenanceRecordDto {
    @IsInt()
    @ApiProperty({ example: 123 })
    readonly car_id: number;

    @IsDateString()
    @ApiProperty({ example: '2023-01-01' })
    readonly service_date: string;

    @IsOptional()
    @IsInt()
    @ApiPropertyOptional({ example: 51000 })
    readonly mileage?: number;

    @IsString()
    @ApiProperty({ example: 'Oil 10W40, air filter MANN' })
    readonly description: string;

    @ApiProperty({ example: 'MAINTENANCE', enum: ServiceType })
    @IsEnum(ServiceType)
    readonly service_type: ServiceType;

    @IsOptional()
    @ApiPropertyOptional({ example: 'OIL_CHANGE', enum: ServiceCategory })
    @IsEnum(ServiceCategory)
    readonly service_category?: ServiceCategory;

    @IsNumber()
    @ApiProperty({ example: 250 })
    readonly cost: number;

    @IsOptional()
    @IsDateString()
    @ApiPropertyOptional({ example: '2024-01-01' })
    readonly expiry_date?: string;

    @IsOptional()
    @IsBoolean()
    @ApiPropertyOptional({ example: false })
    readonly is_diy?: boolean;

    @IsOptional()
    @IsNumber()
    @ApiPropertyOptional({ example: 42.5, description: 'Fuel quantity in liters, for ALIMENTARE records' })
    readonly fuel_liters?: number;

    @IsOptional()
    @IsBoolean()
    @ApiPropertyOptional({ example: false, description: 'Whether this expense is a company expense (reimbursable)' })
    readonly is_company_expense?: boolean;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MaintenancePartInputDto)
    @ApiPropertyOptional({ type: [MaintenancePartInputDto] })
    readonly parts?: MaintenancePartInputDto[];
}
