import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CarDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 123 })
  user_id: number;

  @ApiProperty({ example: '1HGCM82633A123456' })
  vin: string;

  @ApiProperty({ example: 'BMW' })
  make: string;

  @ApiProperty({ example: '530iA' })
  model: string;

  @ApiProperty({ example: 1992 })
  year: number;

  @ApiProperty({ example: 'B13HAU' })
  license_plate: string;

  @ApiProperty({ example: 380000 })
  current_mileage: number;

  @ApiProperty({ example: 'base64/someImageHere' })
  @IsString()
  @IsOptional()
  image?: string;
}
