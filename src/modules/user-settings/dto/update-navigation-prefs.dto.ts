import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsInt,
    IsOptional,
    Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// The frontend owns the actual set of valid bottom-bar ids; the backend only
// enforces the shape (lowercase-ish slug, 1-4 unique entries).
const BOTTOM_BAR_ITEM_PATTERN = /^[a-z][a-z0-9_:-]{0,40}$/;

export class UpdateNavigationPrefsDto {
    @ApiPropertyOptional({
        type: [String],
        nullable: true,
        description: '1-3 unique bottom-bar item ids. Null resets to the frontend defaults.',
        example: ['garage', 'documents', 'maintenance', 'settings'],
    })
    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(3)
    @ArrayUnique()
    @Matches(BOTTOM_BAR_ITEM_PATTERN, { each: true })
    readonly bottom_bar?: string[] | null;

    @ApiPropertyOptional({
        nullable: true,
        description: 'Car id to favorite in this context, or null to unset.',
        example: 143,
    })
    @IsOptional()
    @IsInt()
    readonly favorite_car_id?: number | null;
}
