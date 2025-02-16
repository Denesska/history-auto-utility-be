import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddCarDto {
  @ApiProperty({ example: '6' })
  @IsNumber()
  @IsOptional()
  readonly id: number;

  @ApiProperty({ example: 'WBAHE21060GE64612' })
  @IsString()
  readonly vin: string;

  @ApiProperty({ example: 'BMW' })
  @IsString()
  readonly make: string;

  @ApiProperty({ example: '530iA' })
  @IsString()
  readonly model: string;

  @ApiProperty({ example: 1992 })
  @IsInt()
  readonly year: number;

  @ApiProperty({ example: 'B13HAU' })
  @IsString()
  readonly license_plate: string;

  @ApiProperty({ example: 380000 })
  @IsInt()
  readonly current_mileage: number;

  @ApiProperty({ 
    type: 'string', 
    format: 'binary',
    description: 'Car image file',
    required: false 
  })
  @IsOptional()
  image?: string;
}
