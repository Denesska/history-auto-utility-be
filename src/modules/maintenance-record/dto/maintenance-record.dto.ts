import {IsString, IsInt, IsDate, IsNumber, IsEnum, IsBoolean, IsArray, IsOptional} from 'class-validator';
import {ApiProperty, ApiPropertyOptional} from "@nestjs/swagger";
import {ServiceType} from "../../document/enum/service-type.enum";
import {ServiceCategory} from "../../document/enum/service-category.enum";
import {PlanItemKey} from '@prisma/client';
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

    @IsString()
    @ApiProperty({ example: 'RON' })
    readonly currency: string;

    @IsOptional()
    @IsNumber()
    @ApiPropertyOptional({ nullable: true, example: 250, description: 'cost converted to RON (equals cost for RON); null if no rate was available' })
    readonly cost_ron?: number | null;

    @IsOptional()
    @IsNumber()
    @ApiPropertyOptional({ nullable: true, example: 5.2718, description: 'RON per 1 unit of currency used for cost_ron' })
    readonly exchange_rate?: number | null;

    @IsOptional()
    @ApiPropertyOptional({ nullable: true, description: 'BNR publication date of the rate used; null for RON' })
    readonly exchange_rate_date?: Date | null;

    @IsOptional()
    @IsString()
    @ApiPropertyOptional({ nullable: true, enum: ['BNR', 'MANUAL'], description: "'BNR' when fetched automatically; null for RON" })
    readonly exchange_rate_source?: string | null;

    @IsDate()
    @ApiProperty({ example: 'Insurance' })
    readonly expiry_date: Date;

    @ApiProperty({ example: 'Tire swap', nullable: true })
    readonly reminder_title: string | null;

    @IsBoolean()
    @ApiProperty({ example: false })
    readonly is_diy: boolean;

    @IsOptional()
    @IsNumber()
    @ApiPropertyOptional({ example: 42.5, description: 'Fuel quantity in liters, for ALIMENTARE records (combustion cars)' })
    readonly fuel_liters?: number | null;

    @IsOptional()
    @IsNumber()
    @ApiPropertyOptional({ example: 32.5, description: 'Energy delivered in kWh, for ALIMENTARE records (electric/hybrid cars charging instead of refueling)' })
    readonly energy_kwh?: number | null;

    @IsBoolean()
    @ApiProperty({ example: false, description: 'Whether this expense is a company expense (reimbursable)' })
    readonly is_company_expense: boolean;

    @IsOptional()
    @IsNumber()
    @ApiPropertyOptional({ example: 7.4, description: 'Computed fuel consumption (L/100km) vs. the previous ALIMENTARE fuel record for the same car, when available' })
    readonly consumption_l_100km?: number;

    @IsOptional()
    @IsNumber()
    @ApiPropertyOptional({ example: 18.2, description: 'Computed energy consumption (kWh/100km) vs. the previous ALIMENTARE charging record for the same car, when available' })
    readonly consumption_kwh_100km?: number;

    @IsOptional()
    @IsNumber()
    @ApiPropertyOptional({ nullable: true, example: 300, description: 'User override of the parts total; null = automatic sum' })
    readonly parts_cost?: number | null;

    @IsOptional()
    @IsString()
    @ApiPropertyOptional({ nullable: true, example: 'RON' })
    readonly parts_cost_currency?: string | null;

    @IsArray()
    @ApiProperty({ type: [MaintenancePartDto] })
    readonly parts: MaintenancePartDto[];

    @IsArray()
    @ApiProperty({ enum: PlanItemKey, enumName: 'PlanItemKey', isArray: true, example: ['ENGINE_OIL'], description: 'Plan items this record resets' })
    readonly plan_items: PlanItemKey[];

    @IsArray()
    @ApiProperty({ type: [String], example: ['Replaced wiper blades'], description: 'Free-text work items typed by the user' })
    readonly custom_items: string[];

    @IsInt()
    @ApiProperty({ example: 2 })
    readonly attachmentsCount: number;

    @IsOptional()
    @IsString()
    @ApiPropertyOptional({ example: 'https://r2.example.com/signed-url' })
    readonly thumbnailUrl?: string | null;

    @IsOptional()
    @IsInt()
    @ApiPropertyOptional({ example: 1, nullable: true, description: 'Supplier directory entry (garage/workshop) that carried out this work' })
    readonly supplier_id?: number | null;

    @IsOptional()
    @IsString()
    @ApiPropertyOptional({ example: 'Auto Service Popescu', nullable: true, description: 'Free-text workshop name (personal records)' })
    readonly service_name?: string | null;
}
