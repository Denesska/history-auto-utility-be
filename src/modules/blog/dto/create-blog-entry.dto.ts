import {
  IsString, IsEnum, IsOptional, IsBoolean, IsInt, IsNumber,
  IsArray, ValidateNested, IsDateString, IsObject, ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BlogCategory } from '../enum/blog-category.enum';
import { VehicleEntryCategory } from '../enum/vehicle-entry-category.enum';
import { BlogStatus } from '../enum/blog-status.enum';

export class CreateBlogTagDto {
  @IsString()
  @ApiProperty({ example: 'oil change' })
  label: string;

  @IsString()
  @ApiProperty({ example: 'blue' })
  color: string;
}

export class CreateBlogEntryDto {
  @IsEnum(BlogCategory)
  @ApiProperty({ enum: BlogCategory })
  category: BlogCategory;

  @IsString()
  @ApiProperty({ example: 'Oil service' })
  title: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'oil-service-2026', required: false })
  slug?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'Short summary of the entry.', required: false })
  excerpt?: string;

  @IsDateString()
  @ApiProperty({ example: '2026-01-15' })
  date: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'Changed oil and filter.', required: false })
  content?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({ example: { type: 'doc', content: [] }, required: false, description: 'Tiptap JSON document' })
  content_json?: Record<string, unknown>;

  @IsEnum(BlogStatus)
  @IsOptional()
  @ApiProperty({ enum: BlogStatus, required: false, default: BlogStatus.DRAFT })
  status?: BlogStatus;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ example: false, required: false })
  is_pinned?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', required: false })
  cover_gradient?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: '/uploads/blog/cover.jpg', required: false })
  cover_image_url?: string;

  @ValidateIf(o => o.category === BlogCategory.VEHICLE)
  @IsInt()
  @ApiProperty({ example: 1, required: false })
  car_id?: number;

  @IsEnum(VehicleEntryCategory)
  @IsOptional()
  @ApiProperty({ enum: VehicleEntryCategory, required: false })
  vehicle_category?: VehicleEntryCategory;

  @IsInt()
  @IsOptional()
  @ApiProperty({ example: 184300, required: false })
  km?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ example: 450.0, required: false })
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
  @ApiProperty({ type: [String], required: false, description: 'Array of gallery image URLs' })
  images?: string[];
}
