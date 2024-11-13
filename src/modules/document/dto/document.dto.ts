import { ApiProperty } from '@nestjs/swagger';

export class DocumentDto {
    @ApiProperty({ example: 1 })
    id: number;

    @ApiProperty({ example: 'Insurance' })
    document_type: string;

    @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
    issue_date: Date;

    @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
    expiry_date: Date;

    @ApiProperty({ example: 1 })
    car_id: number;
}
