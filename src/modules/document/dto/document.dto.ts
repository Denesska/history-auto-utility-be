import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DocumentDto {
    @ApiProperty({ example: 1 })
    id: number;

    @ApiProperty({ example: 'RCA' })
    document_type: string;

    @ApiProperty({ example: 1 })
    car_id: number;

    @ApiPropertyOptional({ nullable: true })
    issue_date: Date | null;

    @ApiPropertyOptional({ nullable: true })
    expiry_date: Date | null;

    @ApiPropertyOptional({ nullable: true })
    provider: string | null;

    @ApiPropertyOptional({ nullable: true })
    policy_series: string | null;

    @ApiPropertyOptional({ nullable: true })
    policy_number: string | null;

    @ApiPropertyOptional({ nullable: true, description: 'Insurance premium amount paid' })
    premium: number | null;

    @ApiPropertyOptional({ nullable: true, example: 'RON' })
    currency: string | null;

    @ApiPropertyOptional({ nullable: true, example: 'B8' })
    bonus_malus_class: string | null;

    @ApiPropertyOptional({ nullable: true })
    status: string | null;

    @ApiPropertyOptional({ nullable: true })
    policyholder: string | null;

    @ApiPropertyOptional({ nullable: true })
    cnp_id: string | null;

    @ApiPropertyOptional({ nullable: true })
    file_url: string | null;

    @ApiPropertyOptional({ nullable: true })
    file_name: string | null;

    @ApiPropertyOptional({ nullable: true })
    file_size: number | null;

    @ApiProperty({ example: true, description: 'Whether this document is the active one for its type/period' })
    is_active: boolean;

    @ApiPropertyOptional({ nullable: true, example: 'HU', description: 'ISO 3166-1 alpha-2 country a vignette is valid in; null = RO' })
    country: string | null;

    @ApiPropertyOptional({ nullable: true, example: 5271.8, description: 'premium converted to RON (equals premium for RON); null if no premium or no rate was available' })
    premium_ron: number | null;

    @ApiPropertyOptional({ nullable: true, example: 5.2718, description: 'RON per 1 unit of currency used for premium_ron (BNR multiplier already applied)' })
    exchange_rate: number | null;

    @ApiPropertyOptional({ nullable: true, description: 'BNR publication date of the rate used; the save date for MANUAL; null for RON' })
    exchange_rate_date: Date | null;

    @ApiPropertyOptional({ nullable: true, enum: ['BNR', 'MANUAL'], description: "'BNR' when fetched automatically, 'MANUAL' when supplied by the client; null for RON" })
    exchange_rate_source: string | null;
}
