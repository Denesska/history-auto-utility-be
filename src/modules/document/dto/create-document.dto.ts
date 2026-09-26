import { IsString, IsDateString, IsInt, IsOptional, IsNumber, IsBoolean, Matches, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDocumentDto {
    @ApiProperty({ example: 'RCA' })
    @IsString()
    readonly document_type: string;

    @ApiProperty({ example: 1 })
    @IsInt()
    readonly car_id: number;

    @ApiPropertyOptional({ example: '2023-01-01' })
    @IsOptional()
    @IsDateString()
    readonly issue_date?: string;

    @ApiPropertyOptional({ example: '2024-01-01' })
    @IsOptional()
    @IsDateString()
    readonly expiry_date?: string;

    @ApiPropertyOptional({ example: 'Allianz-Tiriac Asigurări' })
    @IsOptional()
    @IsString()
    readonly provider?: string;

    @ApiPropertyOptional({ example: 'RO/34/D34/TL' })
    @IsOptional()
    @IsString()
    readonly policy_series?: string;

    @ApiPropertyOptional({ example: 'POL-123456789' })
    @IsOptional()
    @IsString()
    readonly policy_number?: string;

    @ApiPropertyOptional({ example: 1036.14, description: 'Insurance premium amount paid' })
    @IsOptional()
    @IsNumber()
    readonly premium?: number;

    @ApiPropertyOptional({ example: 'RON' })
    @IsOptional()
    @IsString()
    readonly currency?: string;

    @ApiPropertyOptional({ example: 'B8' })
    @IsOptional()
    @IsString()
    readonly bonus_malus_class?: string;

    @ApiPropertyOptional({ example: 'Active' })
    @IsOptional()
    @IsString()
    readonly status?: string;

    @ApiPropertyOptional({ example: 'John Doe' })
    @IsOptional()
    @IsString()
    readonly policyholder?: string;

    @ApiPropertyOptional({ example: '1900101012345' })
    @IsOptional()
    @IsString()
    readonly cnp_id?: string;

    @ApiPropertyOptional({ example: true, description: 'Whether this document is the active one for its type/period' })
    @IsOptional()
    @IsBoolean()
    readonly is_active?: boolean;

    @ApiPropertyOptional({ example: 'HU', nullable: true, description: 'ISO 3166-1 alpha-2 country a vignette is valid in; null/absent = RO' })
    @IsOptional()
    @Matches(/^[A-Z]{2}$/)
    readonly country?: string | null;

    @ApiPropertyOptional({
        example: 5.0,
        nullable: true,
        description: 'Manual override: RON per 1 unit of currency. When omitted the backend uses the latest BNR rate. premium_ron / exchange_rate_date / exchange_rate_source are always computed server-side.',
    })
    @IsOptional()
    @IsNumber()
    @IsPositive()
    readonly exchange_rate?: number | null;
}
