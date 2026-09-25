import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CarWishStatus, ServiceType } from '@prisma/client';

export class CarWishDto {
    @ApiProperty({ example: 1 })
    id: number;

    @ApiProperty({ example: 1 })
    car_id: number;

    @ApiProperty({ example: 'Jante de iarnă 17"' })
    title: string;

    @ApiPropertyOptional({ nullable: true, example: 'Second-hand, set complet cu anvelope' })
    notes: string | null;

    @ApiPropertyOptional({ nullable: true, example: 2400 })
    estimated_cost: number | null;

    @ApiPropertyOptional({ nullable: true, enum: ServiceType, example: 'IMPROVEMENT' })
    service_type: ServiceType | null;

    @ApiProperty({ example: 0, description: 'Hand-set priority order, lowest first.' })
    position: number;

    @ApiProperty({ enum: CarWishStatus, example: 'ACTIVE' })
    status: CarWishStatus;

    @ApiPropertyOptional({ nullable: true })
    done_at: Date | null;

    @ApiProperty()
    created_at: Date;

    @ApiProperty()
    updated_at: Date;
}
