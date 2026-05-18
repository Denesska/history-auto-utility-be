import { IsInt, IsNumber, IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FuelType, TransmissionType } from '@prisma/client';

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

  @ApiProperty({ example: 'IS49WAU' })
  @IsString()
  readonly license_plate: string;

  @ApiProperty({ example: 'WBAHE21060GE64612' })
  @IsString()
  @IsOptional()
  readonly vin?: string;

  @ApiProperty({ example: 2006 })
  @Type(() => Number)
  @IsInt()
  readonly year: number;

  @ApiProperty({ example: 'PETROL', enum: FuelType })
  @IsEnum(FuelType)
  @IsOptional()
  readonly fuel_type?: FuelType;

  @ApiProperty({ example: 'MANUAL', enum: TransmissionType })
  @IsEnum(TransmissionType)
  @IsOptional()
  readonly transmission?: TransmissionType;

  @ApiProperty({ example: '2.0L Turbo' })
  @IsString()
  @IsOptional()
  readonly engine?: string;

  @ApiProperty({ example: '#1A2B3C' })
  @IsString()
  @IsOptional()
  readonly color?: string;

  @ApiProperty({ example: 184200 })
  @Type(() => Number)
  @IsInt()
  readonly current_mileage: number;

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
}
