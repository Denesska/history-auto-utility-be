import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Current legal-acceptance status for a user — returned by `GET /legal/status`,
 * `POST /legal/accept` and folded into `GET /auth/me` (`legal` field).
 */
export class LegalStatusDto {
  @ApiProperty({ example: '2026-10-10', description: 'Current terms version (CURRENT_TERMS_VERSION).' })
  termsVersion: string;

  @ApiProperty({ example: '2026-10-10', description: 'Current privacy policy version (CURRENT_PRIVACY_VERSION).' })
  privacyVersion: string;

  @ApiPropertyOptional({ nullable: true })
  acceptedTermsVersion: string | null;

  @ApiPropertyOptional({ nullable: true })
  acceptedPrivacyVersion: string | null;

  @ApiPropertyOptional({ nullable: true })
  acceptedAt: string | null;

  @ApiProperty({ description: 'True unless the accepted terms AND privacy versions both equal the current ones.' })
  needsAcceptance: boolean;
}
