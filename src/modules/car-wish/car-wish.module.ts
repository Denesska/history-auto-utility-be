import { Module } from '@nestjs/common';
import { CarWishController } from './car-wish.controller';
import { CarWishService } from './car-wish.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CarAccessModule } from '../car-access/car-access.module';

@Module({
    imports: [PrismaModule, CarAccessModule],
    controllers: [CarWishController],
    providers: [CarWishService],
    exports: [CarWishService],
})
export class CarWishModule {}
