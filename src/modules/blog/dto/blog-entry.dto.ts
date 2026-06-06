import { ApiProperty } from '@nestjs/swagger';
import { BlogCategory } from '../enum/blog-category.enum';
import { VehicleEntryCategory } from '../enum/vehicle-entry-category.enum';
import { BlogStatus } from '../enum/blog-status.enum';

export class BlogTagDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'oil change' })
  label: string;

  @ApiProperty({ example: 'blue' })
  color: string;
}

export class BlogImageDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: '/uploads/blog/photo.jpg' })
  url: string;
}

export class BlogEntryDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  user_id: number;

  @ApiProperty({ enum: BlogCategory, example: BlogCategory.VEHICLE })
  category: BlogCategory;

  @ApiProperty({ example: 'Oil service' })
  title: string;

  @ApiProperty({ example: 'oil-service-2026', nullable: true })
  slug: string | null;

  @ApiProperty({ example: 'Short summary.', nullable: true })
  excerpt: string | null;

  @ApiProperty({ example: '2026-01-15T00:00:00.000Z' })
  date: string;

  @ApiProperty({ example: 'Changed oil and filter.' })
  content: string;

  @ApiProperty({ example: { type: 'doc', content: [] }, nullable: true })
  content_json: Record<string, unknown> | null;

  @ApiProperty({ enum: BlogStatus, example: BlogStatus.DRAFT })
  status: BlogStatus;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z', nullable: true })
  published_at: string | null;

  @ApiProperty({ example: false })
  is_pinned: boolean;

  @ApiProperty({ example: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', nullable: true })
  cover_gradient: string | null;

  @ApiProperty({ example: '/uploads/blog/cover.jpg', nullable: true })
  cover_image_url: string | null;

  @ApiProperty({ example: 1, nullable: true })
  car_id: number | null;

  @ApiProperty({ example: 'BMW 520i', nullable: true })
  car_name: string | null;

  @ApiProperty({ enum: VehicleEntryCategory, nullable: true })
  vehicle_category: VehicleEntryCategory | null;

  @ApiProperty({ example: 184300, nullable: true })
  km: number | null;

  @ApiProperty({ example: 450.0, nullable: true })
  price: number | null;

  @ApiProperty({ type: [BlogTagDto] })
  tags: BlogTagDto[];

  @ApiProperty({ type: [BlogImageDto] })
  images: BlogImageDto[];

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  created_at: string;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  updated_at: string;
}

export class VehicleCategoryDto {
  @ApiProperty({ enum: VehicleEntryCategory })
  value: VehicleEntryCategory;

  @ApiProperty({ example: 'Repair' })
  label: string;
}
