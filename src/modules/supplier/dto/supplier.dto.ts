import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierType } from '@prisma/client';

export class SupplierDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Service Auto Plus' })
  name: string;

  @ApiProperty({ enum: SupplierType, example: SupplierType.SERVICE })
  type: SupplierType;

  @ApiPropertyOptional({ nullable: true })
  contact_name: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ nullable: true })
  email: string | null;

  @ApiPropertyOptional({ nullable: true })
  address: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @ApiProperty({ example: true })
  is_active: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Null = personal supplier, visible only to its creator' })
  organization_id: number | null;
}
