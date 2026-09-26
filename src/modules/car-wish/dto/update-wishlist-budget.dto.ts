import { IsNumber, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWishlistBudgetDto {
    @ApiPropertyOptional({ nullable: true, example: 5000, description: 'null removes the budget line entirely.' })
    @IsOptional()
    @IsNumber()
    readonly budget?: number | null;
}
