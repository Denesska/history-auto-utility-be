import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CarWishStatus, ServiceType } from '@prisma/client';

// Written out rather than PartialType(CreateCarWishDto) so the clearable fields
// accept an explicit `null` (wipe the value) as distinct from `undefined`
// (leave it alone) — the service branches on exactly that.
export class UpdateCarWishDto {
    @ApiPropertyOptional({ example: 'Jante de iarnă 17"' })
    @IsOptional()
    @IsString()
    readonly title?: string;

    @ApiPropertyOptional({ nullable: true, example: 'Second-hand, set complet cu anvelope' })
    @IsOptional()
    @IsString()
    readonly notes?: string | null;

    @ApiPropertyOptional({ nullable: true, example: 2400 })
    @IsOptional()
    @IsNumber()
    readonly estimated_cost?: number | null;

    @ApiPropertyOptional({ nullable: true, enum: ServiceType, example: 'IMPROVEMENT' })
    @IsOptional()
    @IsEnum(ServiceType)
    readonly service_type?: ServiceType | null;

    @ApiPropertyOptional({ enum: CarWishStatus, example: 'DONE' })
    @IsOptional()
    @IsEnum(CarWishStatus)
    readonly status?: CarWishStatus;
}
