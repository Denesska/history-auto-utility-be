import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceCategory } from '@prisma/client';

export class MaintenanceSettingDto {
  @ApiProperty({ example: 'OIL_CHANGE', enum: ServiceCategory })
  category: ServiceCategory;

  @ApiProperty({ example: true, description: 'Whether this category should show a progress bar / notify the user' })
  tracked: boolean;

  @ApiPropertyOptional({ nullable: true, example: 8000, description: 'Resolved interval: custom value if set, otherwise the global default' })
  interval_km: number | null;

  @ApiPropertyOptional({ nullable: true, example: 12, description: 'Resolved interval: custom value if set, otherwise the global default' })
  interval_months: number | null;

  @ApiProperty({ example: false, description: 'True if interval_km came from a user override rather than the global default' })
  is_custom_km: boolean;

  @ApiProperty({ example: false, description: 'True if interval_months came from a user override rather than the global default' })
  is_custom_months: boolean;
}
