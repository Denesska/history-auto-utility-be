import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * One address as the ITL 054 form breaks it down. Every sub-field is a separate
 * blank on the paper form, which is why this isn't a single free-text line.
 */
export class ContractAddressDto {
    @ApiPropertyOptional({ description: 'Left empty for Romania.', example: 'ROMÂNIA' })
    @IsOptional()
    @IsString()
    @MaxLength(60)
    readonly country?: string;

    @ApiPropertyOptional({ example: 'Cluj' })
    @IsOptional()
    @IsString()
    @MaxLength(60)
    readonly county?: string;

    @ApiPropertyOptional({ example: '400001' })
    @IsOptional()
    @IsString()
    @MaxLength(12)
    readonly postal_code?: string;

    @ApiPropertyOptional({ description: 'municipiul/oraşul/comuna', example: 'Cluj-Napoca' })
    @IsOptional()
    @IsString()
    @MaxLength(80)
    readonly city?: string;

    @ApiPropertyOptional({ description: 'satul/sectorul', example: 'Sector 3' })
    @IsOptional()
    @IsString()
    @MaxLength(80)
    readonly village_or_sector?: string;

    @ApiPropertyOptional({ example: 'Aleea Peana' })
    @IsOptional()
    @IsString()
    @MaxLength(120)
    readonly street?: string;

    @ApiPropertyOptional({ example: '12A' })
    @IsOptional()
    @IsString()
    @MaxLength(12)
    readonly street_number?: string;

    @ApiPropertyOptional({ example: 'D3' })
    @IsOptional()
    @IsString()
    @MaxLength(12)
    readonly building?: string;

    @ApiPropertyOptional({ example: '2' })
    @IsOptional()
    @IsString()
    @MaxLength(8)
    readonly staircase?: string;

    @ApiPropertyOptional({ example: '4' })
    @IsOptional()
    @IsString()
    @MaxLength(8)
    readonly floor?: string;

    @ApiPropertyOptional({ example: '17' })
    @IsOptional()
    @IsString()
    @MaxLength(8)
    readonly apartment?: string;
}
