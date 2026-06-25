import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CarNoteDto {
    @ApiProperty({ example: 1 })
    id: number;

    @ApiProperty({ example: 1 })
    car_id: number;

    @ApiProperty({ example: 'PIN casetofon' })
    title: string;

    @ApiProperty({ example: '1234, introdus de 3 ori la rând' })
    content: string;

    @ApiPropertyOptional({ nullable: true, example: 'Recomandări' })
    group_name: string | null;

    @ApiProperty()
    created_at: Date;

    @ApiProperty()
    updated_at: Date;
}
