import { ApiProperty } from '@nestjs/swagger';

export class NavigationPrefsDto {
    @ApiProperty({
        type: [String],
        nullable: true,
        description: 'Mobile bottom-bar item ids, in order. Null = not set; use the frontend defaults.',
        example: ['garage', 'documents', 'maintenance', 'settings'],
    })
    bottom_bar: string[] | null;

    @ApiProperty({
        nullable: true,
        description: "Favorite car for this context. Null = not set, or the previously stored car is no longer accessible.",
        example: 143,
    })
    favorite_car_id: number | null;
}
