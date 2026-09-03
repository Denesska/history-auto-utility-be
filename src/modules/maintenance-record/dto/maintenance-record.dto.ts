import {IsString, IsInt, IsDate, IsNumber, IsEnum, IsBoolean, IsArray, IsOptional} from 'class-validator';
import {ApiProperty, ApiPropertyOptional} from "@nestjs/swagger";
import {ServiceType} from "../../document/enum/service-type.enum";
import {ServiceCategory} from "../../document/enum/service-category.enum";
import {MaintenancePartDto} from "./maintenance-part.dto";

export class MaintenanceRecordDto {
    @IsInt()
    @ApiProperty({ example: '123' })
    readonly id: number;

    @IsInt()
    @ApiProperty({ example: '123' })
    readonly car_id: number;

    @IsDate()
    @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
    readonly service_date: Date;

    @IsOptional()
    @IsInt()
    @ApiPropertyOptional({ example: '380000' })
    readonly mileage?: number | null;

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
    @ApiProperty({ example: 'Insurance' })
    readonly cost: number;

    @IsDate()
    @ApiProperty({ example: 'Insurance' })
    readonly expiry_date: Date;

    @IsBoolean()
    @ApiProperty({ example: false })
    readonly is_diy: boolean;

    @IsOptional()
    @IsNumber()
    @ApiPropertyOptional({ example: 42.5, description: 'Fuel quantity in liters, for ALIMENTARE records' })
    readonly fuel_liters?: number | null;

    @IsBoolean()
    @ApiProperty({ example: false, description: 'Whether this expense is a company expense (reimbursable)' })
    readonly is_company_expense: boolean;

    @IsOptional()
    @IsNumber()
    @ApiPropertyOptional({ example: 7.4, description: 'Computed fuel consumption (L/100km) vs. the previous ALIMENTARE record for the same car, when available' })
    readonly consumption_l_100km?: number;

    @IsArray()
    @ApiProperty({ type: [MaintenancePartDto] })
    readonly parts: MaintenancePartDto[];

    @IsInt()
    @ApiProperty({ example: 2 })
    readonly attachmentsCount: number;

    @IsOptional()
    @IsString()
    @ApiPropertyOptional({ example: 'https://r2.example.com/signed-url' })
    readonly thumbnailUrl?: string | null;
}
