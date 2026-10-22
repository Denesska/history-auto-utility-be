import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanItemKey } from '@prisma/client';

export class MaintenanceSettingDto {
  @ApiProperty({ example: 1, description: 'Which MaintenanceProfile this override belongs to' })
  profile_id: number;

  @ApiProperty({ example: 'ENGINE_OIL', enum: PlanItemKey, enumName: 'PlanItemKey' })
  item: PlanItemKey;

  @ApiProperty({ example: true, description: 'Whether this item should show a progress bar / notify the user' })
  tracked: boolean;

  @ApiPropertyOptional({ nullable: true, example: 8000, description: 'Resolved interval: custom value if set, otherwise the global default' })
  interval_km: number | null;

  @ApiPropertyOptional({ nullable: true, example: 12, description: 'Resolved interval: custom value if set, otherwise the global default' })
  interval_months: number | null;

  @ApiPropertyOptional({ nullable: true, example: 2, description: 'Resolved interval in engine-oil changes (e.g. diesel fuel filter): custom value if set, otherwise the catalog default' })
  interval_oil_changes: number | null;

  @ApiProperty({ example: false, description: 'True if interval_km came from a user override rather than the global default' })
  is_custom_km: boolean;

  @ApiProperty({ example: false, description: 'True if interval_months came from a user override rather than the global default' })
  is_custom_months: boolean;

  @ApiProperty({ example: false, description: 'True if interval_oil_changes came from a user override rather than the catalog default' })
  is_custom_oil_changes: boolean;
}
