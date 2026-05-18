import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { FuelType, TransmissionType } from '@prisma/client';

export class CarPhotoDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: '/uploads/cars/photo.jpg' })
  url: string;

  @ApiProperty({ example: false })
  is_default: boolean;
}

export class CarDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 123 })
  user_id: number;

  @ApiProperty({ example: '1HGCM82633A123456' })
  @IsOptional()
  vin?: string | null;

  @ApiProperty({ example: 'BMW' })
  make: string;

  @ApiProperty({ example: '530iA' })
  model: string;

  @ApiProperty({ example: 'M Sport' })
  @IsOptional()
  variant?: string | null;

  @ApiProperty({ example: 1992 })
  year: number;

  @ApiProperty({ example: 'IS49WAU' })
  license_plate: string;

  @ApiProperty({ example: 'PETROL', enum: FuelType })
  @IsOptional()
  fuel_type?: FuelType | null;

  @ApiProperty({ example: 'MANUAL', enum: TransmissionType })
  @IsOptional()
  transmission?: TransmissionType | null;

  @ApiProperty({ example: '2.0L Turbo' })
  @IsOptional()
  engine?: string | null;

  @ApiProperty({ example: '#1A2B3C' })
  @IsOptional()
  color?: string | null;

  @ApiProperty({ example: 184200 })
  current_mileage: number;

  @ApiProperty({ example: '2024-05-12T00:00:00.000Z' })
  @IsOptional()
  ownership_start_date?: Date | null;

  @ApiProperty({ example: '2026-03-10T00:00:00.000Z' })
  @IsOptional()
  rca_expiry_date?: Date | null;

  @ApiProperty({ example: '2026-04-20T00:00:00.000Z' })
  @IsOptional()
  itp_expiry_date?: Date | null;

  @ApiProperty({ example: '2026-05-15T00:00:00.000Z' })
  @IsOptional()
  rov_expiry_date?: Date | null;

  @ApiProperty({ example: '2026-03-12T00:00:00.000Z' })
  @IsOptional()
  last_oil_service_date?: Date | null;

  @ApiProperty({ example: 180000 })
  @IsOptional()
  last_oil_service_mileage?: number | null;

  @ApiProperty({ type: [CarPhotoDto] })
  photos: CarPhotoDto[];
}
