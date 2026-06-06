import { IsEnum, IsInt, IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { BlogCategory } from '../enum/blog-category.enum';
import { VehicleEntryCategory } from '../enum/vehicle-entry-category.enum';

export class GetBlogEntriesDto {
  @IsEnum(BlogCategory)
  @IsOptional()
  @ApiProperty({ enum: BlogCategory, required: false })
  category?: BlogCategory;

  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @ApiProperty({ required: false })
  car_id?: number;

  @IsEnum(VehicleEntryCategory)
  @IsOptional()
  @ApiProperty({ enum: VehicleEntryCategory, required: false })
  vehicle_category?: VehicleEntryCategory;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false, description: 'Search in title and content' })
  search?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @ApiProperty({ required: false })
  is_pinned?: boolean;
}
