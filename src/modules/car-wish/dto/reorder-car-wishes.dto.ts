import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderCarWishesDto {
    @ApiProperty({ type: [Number], example: [12, 9, 14], description: 'Wish ids in their new top-to-bottom order.' })
    @IsArray()
    @ArrayNotEmpty()
    @IsInt({ each: true })
    readonly ids: number[];
}
