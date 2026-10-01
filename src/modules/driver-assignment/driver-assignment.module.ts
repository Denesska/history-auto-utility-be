import { Module } from '@nestjs/common';
import { DriverAssignmentController } from './driver-assignment.controller';
import { DriverAssignmentService } from './driver-assignment.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CarAccessModule } from '../car-access/car-access.module';

@Module({
  imports: [PrismaModule, CarAccessModule],
  controllers: [DriverAssignmentController],
  providers: [DriverAssignmentService],
  exports: [DriverAssignmentService],
})
export class DriverAssignmentModule {}
