import { IsInt, IsNumber, IsOptional, IsString, IsEnum, IsDateString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DrivetrainType, FuelType, TransmissionType } from '@prisma/client';
import { OIL_VISCOSITIES } from '../../maintenance-record/plan-item.catalog';

export class AddCarDto {
  @ApiProperty({ example: '6' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  readonly id?: number;

  @ApiProperty({ example: 'BMW' })
  @IsString()
  readonly make: string;

  @ApiProperty({ example: '520i' })
  @IsString()
  readonly model: string;

  @ApiProperty({ example: 'M Sport' })
  @IsString()
  @IsOptional()
  readonly variant?: string;

  @ApiProperty({ example: 'IS49WAU', required: false })
  @IsString()
  @IsOptional()
  readonly license_plate?: string;

  @ApiProperty({ example: 'WBAHE21060GE64612' })
  @IsString()
  @IsOptional()
  readonly vin?: string;

  @ApiProperty({ example: 'Blue Beast' })
  @IsString()
  @IsOptional()
  readonly nickname?: string;

  @ApiProperty({ example: 2006, required: false })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  readonly year?: number;

  @ApiProperty({ example: 'PETROL', enum: FuelType })
  @IsEnum(FuelType)
  @IsOptional()
  readonly fuel_type?: FuelType;

  @ApiProperty({ example: 'MANUAL', enum: TransmissionType })
  @IsEnum(TransmissionType)
  @IsOptional()
  readonly transmission?: TransmissionType;

  @ApiProperty({ example: 'FRONT', enum: DrivetrainType, enumName: 'DrivetrainType', required: false, nullable: true })
  @IsEnum(DrivetrainType)
  @IsOptional()
  readonly drivetrain?: DrivetrainType | null;

  @ApiProperty({ example: '5W-30', enum: OIL_VISCOSITIES, required: false, nullable: true, description: 'Engine oil viscosity grade; sets the engine-oil change interval in the Plan' })
  @IsIn(OIL_VISCOSITIES)
  @IsOptional()
  readonly engine_oil_viscosity?: string | null;

  @ApiProperty({ example: '2.0L Turbo' })
  @IsString()
  @IsOptional()
  readonly engine?: string;

  @ApiProperty({ example: '#1A2B3C' })
  @IsString()
  @IsOptional()
  readonly color?: string;

  @ApiProperty({ example: 184200, required: false })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  readonly current_mileage?: number;

  @ApiProperty({ example: 184200, required: false, description: 'Owner-reported odometer reading, updated over time from the car hub.' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  readonly actual_mileage?: number;

  @ApiProperty({ example: 25000.5, required: false })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  readonly purchase_price?: number;

  @ApiProperty({ example: 'EUR', required: false })
  @IsString()
  @IsOptional()
  readonly purchase_price_currency?: string;

  @ApiProperty({ example: '2024-05-12T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  readonly ownership_start_date?: string;

  @ApiProperty({ example: '2026-03-10T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  readonly rca_expiry_date?: string;

  @ApiProperty({ example: '2026-04-20T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  readonly itp_expiry_date?: string;

  @ApiProperty({ example: '2026-05-15T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  readonly rov_expiry_date?: string;

  @ApiProperty({ example: '2026-03-12T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  readonly last_oil_service_date?: string;

  @ApiProperty({ example: 180000 })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  readonly last_oil_service_mileage?: number;

  @ApiProperty({ example: 0 })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  readonly default_new_photo_index?: number;

  /**
   * Creates the car directly inside this organization's fleet instead of as
   * a personal car — the only way a car enters a fleet. Restricted to a
   * Director-tier member (OWNER/SUPER_ADMIN) of that org; there's no
   * "attach one of my personal cars" path, since a company asset shouldn't
   * depend on — or ever have been — someone's personal property.
   */
  @ApiProperty({ example: 2, required: false })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  readonly organizationId?: number;
}
