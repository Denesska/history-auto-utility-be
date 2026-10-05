import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

// Mirrors FEATURE_KEYS (../../../common/features/feature-keys.ts) one property per key.
// Both DTOs below need a new property whenever a key is added there.

/** Effective per-feature on/off state for one organization — always carries every FEATURE_KEYS key. */
export class AdminFeatureFlagsDto {
  @ApiProperty() supplier: boolean;
  @ApiProperty() fleet_cost: boolean;
  @ApiProperty() sale_contract: boolean;
  @ApiProperty() documents: boolean;
  @ApiProperty() maintenance: boolean;
  @ApiProperty() car_notes: boolean;
  @ApiProperty() car_wishlist: boolean;
  @ApiProperty() journal: boolean;
  @ApiProperty() reports: boolean;
}

/** One organization row for the app-owner "organizations & features" admin screen. */
export class AdminOrganizationDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) plan: string | null;
  @ApiProperty() member_count: number;
  @ApiProperty() car_count: number;
  @ApiProperty({
    type: AdminFeatureFlagsDto,
    description:
      'false only where explicitly disabled for this org; everything else defaults to true',
  })
  feature_flags: Record<string, boolean>;
}

/**
 * PATCH body for /admin/organizations/:id/features. `false` disables the feature for the
 * organization; `true` (or omitting the key) removes any override, back to the default of on.
 * Unknown keys are rejected by the global ValidationPipe (whitelist + forbidNonWhitelisted).
 */
export class UpdateOrganizationFeaturesDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() supplier?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() fleet_cost?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sale_contract?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() documents?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() maintenance?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() car_notes?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() car_wishlist?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() journal?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() reports?: boolean;
}
