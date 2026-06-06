import { Module } from '@nestjs/common';
import { CarAccessModule } from '../car-access/car-access.module';
import { CarController } from './car.controller';
import { CarService } from './car.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, CarAccessModule],
  controllers: [CarController],
  providers: [CarService],
})
export class CarModule {}
