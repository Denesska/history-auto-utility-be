import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CarWishDto } from './car-wish.dto';

// One payload for the whole screen: the budget the line is drawn at lives on
// the car, the items are ordered by `position`, so the client never has to
// stitch two requests together to render the list.
export class CarWishlistDto {
    @ApiPropertyOptional({ nullable: true, example: 5000, description: 'Spending ceiling the budget line is drawn at, in RON.' })
    budget: number | null;

    @ApiProperty({ type: [CarWishDto] })
    items: CarWishDto[];
}
