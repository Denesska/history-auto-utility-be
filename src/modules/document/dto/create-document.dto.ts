import { IsString, IsDateString, IsInt, IsOptional } from 'class-validator';
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

    @ApiPropertyOptional({ example: 'POL-123456789' })
    @IsOptional()
    @IsString()
    readonly policy_number?: string;

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
}
