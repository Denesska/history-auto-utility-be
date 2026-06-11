import { Module } from '@nestjs/common';
import { CarAccessModule } from '../car-access/car-access.module';
import { CarController } from './car.controller';
import { CarService } from './car.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, CarAccessModule, StorageModule],
  controllers: [CarController],
  providers: [CarService],
  exports: [CarService],
})
export class CarModule {}
