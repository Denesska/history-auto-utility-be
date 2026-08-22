import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMaintenanceSettingDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  readonly tracked?: boolean;

  @ApiPropertyOptional({ nullable: true, example: 8000, description: 'Send null to clear the override and fall back to the default' })
  @IsOptional()
  @IsInt()
  @Min(0)
  readonly custom_interval_km?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 12, description: 'Send null to clear the override and fall back to the default' })
  @IsOptional()
  @IsInt()
  @Min(0)
  readonly custom_interval_months?: number | null;
}
