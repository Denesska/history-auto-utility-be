import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** The user's own latest request, as surfaced back to them (no reviewer identity). */
export class BusinessAccessRequestSummaryDto {
  @ApiProperty() id: number;
  @ApiProperty() company_name: string;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiPropertyOptional({ nullable: true }) rejection_reason: string | null;
  @ApiProperty() created_at: Date;
  @ApiPropertyOptional({ nullable: true }) decided_at: Date | null;
}

/**
 * `status` folds in the "allowed" rule (is_admin / grandfathered Director+ /
 * approved request) — it reads APPROVED even when the user has no actual
 * BusinessAccessRequest row, so the frontend only needs one field to decide
 * whether to show "Create company" or the request form.
 */
export class BusinessAccessStatusDto {
  @ApiProperty({ enum: ['NONE', 'PENDING', 'APPROVED', 'REJECTED'] })
  status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

  @ApiProperty()
  canCreateOrganization: boolean;

  @ApiPropertyOptional({ type: BusinessAccessRequestSummaryDto, nullable: true })
  request: BusinessAccessRequestSummaryDto | null;
}
