import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExtractedFieldsDto {
    @ApiPropertyOptional({ description: 'Insurance policy series' })
    policy_series?: string;

    @ApiPropertyOptional({ description: 'Insurance policy number' })
    policy_number?: string;

    @ApiPropertyOptional({ description: 'Insurer / insurance company name' })
    insurer_name?: string;

    @ApiPropertyOptional({ description: 'Broker or agent name' })
    broker_name?: string;

    @ApiPropertyOptional({ description: 'Policyholder full name' })
    policyholder_name?: string;

    @ApiPropertyOptional({ description: 'Owner name, if different from policyholder' })
    owner_name?: string;

    @ApiPropertyOptional({ description: 'Owner Romanian personal ID (CNP)' })
    owner_cnp?: string;

    @ApiPropertyOptional({ description: 'Vehicle license plate number' })
    plate_number?: string;

    @ApiPropertyOptional({ description: 'Vehicle Identification Number (VIN / chassis number)' })
    vin?: string;

    @ApiPropertyOptional({ description: 'Vehicle make / brand' })
    vehicle_make?: string;

    @ApiPropertyOptional({ description: 'Vehicle model' })
    vehicle_model?: string;

    @ApiPropertyOptional({ description: 'Vehicle category (e.g. M1, N1)' })
    vehicle_category?: string;

    @ApiPropertyOptional({ description: 'Engine displacement in cc' })
    engine_capacity?: string;

    @ApiPropertyOptional({ description: 'Engine power in kW' })
    power?: string;

    @ApiPropertyOptional({ description: 'Number of seats' })
    seats?: string;

    @ApiPropertyOptional({ description: 'Maximum authorized weight' })
    max_weight?: string;

    @ApiPropertyOptional({ description: 'Policy valid from date (ISO 8601)' })
    valid_from?: string;

    @ApiPropertyOptional({ description: 'Policy valid until date (ISO 8601)' })
    valid_until?: string;

    @ApiPropertyOptional({ description: 'Document issue date (ISO 8601)' })
    issue_date?: string;

    @ApiPropertyOptional({ description: 'Insurance premium amount as a numeric string' })
    premium?: string;

    @ApiPropertyOptional({ description: 'Currency code (RON, EUR, USD)' })
    currency?: string;

    @ApiPropertyOptional({ description: 'Bonus-malus class (e.g. B0, B5, M1)' })
    bonus_malus_class?: string;

    @ApiPropertyOptional({ description: 'Whether direct settlement (decontare directă) is included' })
    direct_settlement?: boolean;

    @ApiPropertyOptional({ description: 'Direct settlement limit/price if available' })
    direct_settlement_price?: string;

    @ApiPropertyOptional({ description: 'Payment installments information' })
    payment_installments?: string;

    @ApiPropertyOptional({ description: 'Damage limits (despăgubire maximă)' })
    damage_limits?: string;
}

export class ExtractionResultDto {
    @ApiProperty({ description: 'Whether the document was recognised as a supported type' })
    detected: boolean;

    @ApiPropertyOptional({ description: 'Detected document type, e.g. RCA', example: 'RCA' })
    document_type?: string;

    @ApiProperty({
        description: 'Extraction confidence level',
        enum: ['high', 'medium', 'low', 'none'],
        example: 'high',
    })
    confidence: string;

    @ApiProperty({ type: ExtractedFieldsDto, description: 'Extracted field suggestions for frontend pre-fill' })
    fields: ExtractedFieldsDto;

    @ApiProperty({ type: [String], description: 'Fields or issues that require manual review' })
    warnings: string[];

    @ApiPropertyOptional({
        description: 'First 3000 characters of raw extracted text, useful for debugging',
    })
    raw_text?: string;
}
