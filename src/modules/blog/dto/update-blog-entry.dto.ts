import {
  IsString, IsEnum, IsOptional, IsBoolean, IsInt, IsNumber,
  IsArray, ValidateNested, IsDateString, IsObject,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BlogCategory } from '../enum/blog-category.enum';
import { VehicleEntryCategory } from '../enum/vehicle-entry-category.enum';
import { BlogStatus } from '../enum/blog-status.enum';
import { CreateBlogTagDto } from './create-blog-entry.dto';

export class UpdateBlogEntryDto {
  @IsEnum(BlogCategory)
  @IsOptional()
  @ApiProperty({ enum: BlogCategory, required: false })
  category?: BlogCategory;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'Oil service', required: false })
  title?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'oil-service-2026', required: false })
  slug?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  excerpt?: string;

  @IsDateString()
  @IsOptional()
  @ApiProperty({ example: '2026-01-15', required: false })
  date?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  content?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({ required: false, description: 'Tiptap JSON document' })
  content_json?: Record<string, unknown>;

  @IsEnum(BlogStatus)
  @IsOptional()
  @ApiProperty({ enum: BlogStatus, required: false })
  status?: BlogStatus;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false })
  is_pinned?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  cover_gradient?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  cover_image_url?: string;

  @IsInt()
  @IsOptional()
  @ApiProperty({ required: false })
  car_id?: number;

  @IsEnum(VehicleEntryCategory)
  @IsOptional()
  @ApiProperty({ enum: VehicleEntryCategory, required: false })
  vehicle_category?: VehicleEntryCategory;

  @IsInt()
  @IsOptional()
  @ApiProperty({ required: false })
  km?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  price?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBlogTagDto)
  @IsOptional()
  @ApiProperty({ type: [CreateBlogTagDto], required: false })
  tags?: CreateBlogTagDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ type: [String], required: false })
  images?: string[];
}
