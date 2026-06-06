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
    policy_number: string | null;

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
}
