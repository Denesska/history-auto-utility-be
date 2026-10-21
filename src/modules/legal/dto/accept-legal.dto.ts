import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AcceptLegalDto {
  @ApiProperty({ example: '2026-10-10', description: 'Must equal the current terms version (CURRENT_TERMS_VERSION) or the request is rejected.' })
  @IsString()
  @MinLength(1)
  termsVersion: string;

  @ApiProperty({ example: '2026-10-10', description: 'Must equal the current privacy policy version (CURRENT_PRIVACY_VERSION) or the request is rejected.' })
  @IsString()
  @MinLength(1)
  privacyVersion: string;
}
