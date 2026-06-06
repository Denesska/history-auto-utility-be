import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_PDF_SIZE = 20 * 1024 * 1024;   // 20 MB

export const CONTEXT_TYPES = ['car', 'maintenance', 'document', 'inspection', 'journal'] as const;
export type ContextType = (typeof CONTEXT_TYPES)[number];

export class RequestUploadDto {
  @ApiProperty({ example: 'photo.jpg' })
  @IsString()
  @MaxLength(255)
  originalFileName: string;

  @ApiProperty({ enum: ALLOWED_MIME_TYPES })
  @IsIn(ALLOWED_MIME_TYPES)
  mimeType: AllowedMimeType;

  @ApiProperty({ example: 1048576 })
  @IsInt()
  @IsPositive()
  size: number;

  @ApiProperty({ enum: CONTEXT_TYPES })
  @IsIn(CONTEXT_TYPES)
  contextType: ContextType;

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @IsInt()
  @Min(1)
  contextId?: number;
}
