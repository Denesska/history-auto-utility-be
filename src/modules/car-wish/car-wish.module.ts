import { Module } from '@nestjs/common';
import { CarWishController } from './car-wish.controller';
import { CarWishService } from './car-wish.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [CarWishController],
    providers: [CarWishService],
    exports: [CarWishService],
})
export class CarWishModule {}
