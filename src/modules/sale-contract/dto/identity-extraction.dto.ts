import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { ContractAddressDto } from './address.dto';

export class IdentityDocumentFieldsDto {
    @ApiPropertyOptional() last_name?: string;
    @ApiPropertyOptional() first_name?: string;
    @ApiPropertyOptional() full_name?: string;
    @ApiPropertyOptional() cnp?: string;
    @ApiPropertyOptional({ description: '"Seria" — two letters' }) id_series?: string;
    @ApiPropertyOptional({ description: '"Nr." — six digits' }) id_number?: string;
    @ApiPropertyOptional({ type: ContractAddressDto }) address?: ContractAddressDto;
    @ApiPropertyOptional() issued_by?: string;
    @ApiPropertyOptional() issue_date?: string;
    @ApiPropertyOptional() valid_until?: string;
    @ApiPropertyOptional() nationality?: string;
    @ApiPropertyOptional() place_of_birth?: string;
}

/**
 * Suggestions only. Nothing is stored by the endpoint that returns this, and the
 * uploaded photo is never written to disk or to object storage — it lives in
 * memory for the duration of the call. The user reviews and confirms every field
 * before it is saved anywhere.
 */
export class IdentityExtractionResultDto {
    @ApiProperty() detected: boolean;

    @ApiProperty({ enum: ['high', 'medium', 'low'] })
    confidence: 'high' | 'medium' | 'low';

    @ApiProperty({ type: IdentityDocumentFieldsDto })
    fields: IdentityDocumentFieldsDto;

    @ApiProperty({
        type: [String],
        description:
            'End-user phrased notes, in Romanian. A CNP that fails its checksum is reported here rather than ' +
            'silently dropped — a single misread digit is the most likely failure, and the user must re-check it.',
    })
    warnings: string[];

    @ApiProperty({ description: 'Which AI provider produced this, for comparison. Never a secret.' })
    provider: string;
}

/**
 * Sent with an identity photo. Processing the ID document of the *other* party
 * needs that person's agreement — the app user confirms they have it, and we
 * record which version of the consent wording was shown.
 */
export class IdentityExtractionConsentDto {
    @ApiProperty({ example: '2026-09-v1', description: 'Version of the consent text shown to the user.' })
    @IsString()
    @MaxLength(40)
    readonly consent_version: string;
}
