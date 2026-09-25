import { IsEnum, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType } from '@prisma/client';

export class CreateCarWishDto {
    @ApiProperty({ example: 1 })
    @IsInt()
    readonly car_id: number;

    @ApiProperty({ example: 'Jante de iarnă 17"' })
    @IsString()
    readonly title: string;

    @ApiPropertyOptional({ example: 'Second-hand, set complet cu anvelope' })
    @IsOptional()
    @IsString()
    readonly notes?: string;

    @ApiPropertyOptional({ example: 2400 })
    @IsOptional()
    @IsNumber()
    readonly estimated_cost?: number;

    @ApiPropertyOptional({ enum: ServiceType, example: 'IMPROVEMENT' })
    @IsOptional()
    @IsEnum(ServiceType)
    readonly service_type?: ServiceType;
}
