import { IsIn, ArrayMaxSize, IsString, IsInt, IsNumber, IsEnum, IsOptional, IsDateString, IsBoolean, IsArray, ArrayUnique, ValidateNested, Min, MinLength, MaxLength } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType } from '../../document/enum/service-type.enum';
import { ServiceCategory } from '../../document/enum/service-category.enum';
import { PlanItemKey } from '@prisma/client';
import { CUSTOM_ITEMS_MAX, CUSTOM_ITEM_MAX_LENGTH } from '../custom-items.util';
import { INVOICE_CURRENCIES } from '../invoice-extraction/invoice-extraction.types';
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

    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @IsEnum(PlanItemKey, { each: true })
    @ApiPropertyOptional({ enum: PlanItemKey, enumName: 'PlanItemKey', isArray: true, example: ['ENGINE_OIL', 'AIR_FILTER'], description: 'Plan items this record resets. On update, when provided it replaces the whole set; when omitted it is left unchanged. If service_category is not given, it is derived from these.' })
    readonly plan_items?: PlanItemKey[];

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(CUSTOM_ITEMS_MAX)
    @Transform(({ value }) => {
        if (!Array.isArray(value)) return value;
        const seen = new Set<string>();
        return value.map(v => (typeof v === 'string' ? v.trim() : v)).filter(v => {
            if (typeof v !== 'string') return true;
            const k = v.toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    })
    @IsString({ each: true })
    @MinLength(1, { each: true })
    @MaxLength(CUSTOM_ITEM_MAX_LENGTH, { each: true })
    @ApiPropertyOptional({ type: [String], example: ['Replaced wiper blades'], maxItems: CUSTOM_ITEMS_MAX, description: 'Free-text work items typed by the user (max 10, 1-60 chars each, trimmed, deduped case-insensitively). On update, when provided it replaces the whole array; when omitted it is left unchanged.' })
    readonly custom_items?: string[];

    @IsNumber()
    @ApiProperty({ example: 250 })
    readonly cost: number;

    @IsOptional()
    @IsString()
    @ApiPropertyOptional({ example: 'RON', description: 'Currency the cost was paid in. Defaults to RON. cost_ron/exchange_rate/exchange_rate_date/exchange_rate_source are always computed server-side.' })
    readonly currency?: string;

    @IsOptional()
    @IsDateString()
    @ApiPropertyOptional({ example: '2024-01-01' })
    readonly expiry_date?: string;

    @IsOptional()
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @MaxLength(80)
    @ApiPropertyOptional({ example: 'Tire swap', nullable: true, maxLength: 80, description: 'Name of the reminder date; cleared server-side when expiry_date is cleared.' })
    readonly reminder_title?: string | null;

    @IsOptional()
    @IsBoolean()
    @ApiPropertyOptional({ example: false })
    readonly is_diy?: boolean;

    @IsOptional()
    @IsNumber()
    @ApiPropertyOptional({ example: 42.5, description: 'Fuel quantity in liters, for ALIMENTARE records (combustion cars)' })
    readonly fuel_liters?: number;

    @IsOptional()
    @IsNumber()
    @ApiPropertyOptional({ example: 32.5, description: 'Energy delivered in kWh, for ALIMENTARE records (electric/hybrid cars charging instead of refueling)' })
    readonly energy_kwh?: number;

    @IsOptional()
    @IsBoolean()
    @ApiPropertyOptional({ example: false, description: 'Whether this expense is a company expense (reimbursable)' })
    readonly is_company_expense?: boolean;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @ApiPropertyOptional({ example: 150, nullable: true, description: 'Labor (manopera) amount, in the record currency' })
    readonly labor_cost?: number | null;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @ApiPropertyOptional({ example: 300, nullable: true, description: 'User override of the parts total. null/omitted (with parts_cost_currency null) = automatic sum of the parts.' })
    readonly parts_cost?: number | null;

    @IsOptional()
    @IsIn(INVOICE_CURRENCIES)
    @ApiPropertyOptional({ example: 'RON', nullable: true, description: 'Currency of parts_cost; stored null whenever parts_cost is null.' })
    readonly parts_cost_currency?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    @ApiPropertyOptional({ example: 'Changed oil and filters, checked brakes', nullable: true, description: 'Free multi-line description of the work done' })
    readonly notes?: string | null;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MaintenancePartInputDto)
    @ApiPropertyOptional({ type: [MaintenancePartInputDto] })
    readonly parts?: MaintenancePartInputDto[];

    @IsOptional()
    @IsInt()
    @ApiPropertyOptional({ example: 1, nullable: true, description: 'Supplier directory entry (garage/workshop) that carried out this work. Must be a supplier the caller can see.' })
    readonly supplier_id?: number | null;

    @IsOptional()
    @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
    @IsString()
    @MaxLength(80)
    @ApiPropertyOptional({ example: 'Auto Service Popescu', nullable: true, maxLength: 80, description: 'Free-text workshop name (personal context). Ignored and stored as null when supplier_id is set.' })
    readonly service_name?: string | null;
}
