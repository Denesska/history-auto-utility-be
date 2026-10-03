import { Module } from '@nestjs/common';
import { CarDeadlineOrderController } from './car-deadline-order.controller';
import { CarDeadlineOrderService } from './car-deadline-order.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CarAccessModule } from '../car-access/car-access.module';

@Module({
  imports: [PrismaModule, CarAccessModule],
  controllers: [CarDeadlineOrderController],
  providers: [CarDeadlineOrderService],
  exports: [CarDeadlineOrderService],
})
export class CarDeadlineOrderModule {}
