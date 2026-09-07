import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceCategory } from '../../document/enum/service-category.enum';

export class SuggestCategoryDto {
    @IsString()
    @ApiProperty({ example: 'Schimb ulei motor și filtru' })
    readonly description: string;

    @IsOptional()
    @IsArray()
    @ApiPropertyOptional({ type: [String], example: ['Filtru ulei MANN W712/75'] })
    readonly part_names?: string[];
}

export class SuggestedCategoryDto {
    @ApiProperty({ enum: ServiceCategory, nullable: true, example: 'OIL_CHANGE' })
    readonly category: ServiceCategory | null;

    @ApiProperty({ enum: ['high', 'medium', 'low'] })
    readonly confidence: 'high' | 'medium' | 'low';
}
