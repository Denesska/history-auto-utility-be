import { IsString, IsDate, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDocumentDto {
    @ApiProperty({ example: 'Insurance' })
    @IsString()
    readonly document_type: string;

    @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
    @IsDate()
    readonly issue_date: Date;

    @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
    @IsDate()
    readonly expiry_date: Date;

    @ApiProperty({ example: 1 })
    @IsInt()
    readonly car_id: number;
}
