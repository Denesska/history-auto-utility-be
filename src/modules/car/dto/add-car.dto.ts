import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

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
  @Type(() => Number)
  @IsInt()
  readonly year: number;

  @ApiProperty({ example: 'B13HAU' })
  @IsString()
  readonly license_plate: string;

  @ApiProperty({ example: 380000 })
  @Type(() => Number)
  @IsInt()
  readonly current_mileage: number;

  @ApiProperty({ example: 'base64/someImageHere' })
  @IsString()
  @IsOptional()
  image?: string;
}
