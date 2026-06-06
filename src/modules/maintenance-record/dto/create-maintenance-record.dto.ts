import { IsString, IsInt, IsNumber, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType } from '../../document/enum/service-type.enum';
import { ServiceCategory } from '../../document/enum/service-category.enum';

export class CreateMaintenanceRecordDto {
    @IsInt()
    @ApiProperty({ example: 123 })
    readonly car_id: number;

    @IsDateString()
    @ApiProperty({ example: '2023-01-01' })
    readonly service_date: string;

    @IsInt()
    @ApiProperty({ example: 51000 })
    readonly mileage: number;

    @IsString()
    @ApiProperty({ example: 'Oil 10W40, air filter MANN' })
    readonly description: string;

    @ApiProperty({ example: 'MAINTENANCE', enum: ServiceType })
    @IsEnum(ServiceType)
    readonly service_type: ServiceType;

    @ApiProperty({ example: 'OIL_CHANGE', enum: ServiceCategory })
    @IsEnum(ServiceCategory)
    readonly service_category: ServiceCategory;

    @IsNumber()
    @ApiProperty({ example: 250 })
    readonly cost: number;

    @IsOptional()
    @IsDateString()
    @ApiPropertyOptional({ example: '2024-01-01' })
    readonly expiry_date?: string;
}
