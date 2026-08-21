import { Module } from '@nestjs/common';
import { CarDeadlineOrderController } from './car-deadline-order.controller';
import { CarDeadlineOrderService } from './car-deadline-order.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CarDeadlineOrderController],
  providers: [CarDeadlineOrderService],
  exports: [CarDeadlineOrderService],
})
export class CarDeadlineOrderModule {}
