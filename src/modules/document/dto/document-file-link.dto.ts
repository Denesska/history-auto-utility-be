import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DocumentFileLinkDto {
    @ApiProperty({
        description:
            'Temporary URL to the attached file. Signed for R2-stored files; an absolute ' +
            'API URL for legacy files still served from the backend\'s /uploads directory.',
    })
    url: string;

    @ApiProperty({ example: 'RCA BV31HAU.pdf', description: 'Original file name, as uploaded' })
    file_name: string;

    @ApiPropertyOptional({ nullable: true, example: 596001 })
    file_size: number | null;

    @ApiProperty({ example: 3600, description: 'Seconds until the returned URL stops working' })
    expires_in: number;
}
