import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceCategory } from '@prisma/client';

export class MaintenanceIntervalDto {
  @ApiProperty({ example: 'OIL_CHANGE', enum: ServiceCategory })
  category: ServiceCategory;

  @ApiPropertyOptional({ nullable: true, example: 10000 })
  interval_km: number | null;

  @ApiPropertyOptional({ nullable: true, example: 12 })
  interval_months: number | null;
}
