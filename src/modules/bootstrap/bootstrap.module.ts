import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CarModule } from '../car/car.module';
import { CarAccessModule } from '../car-access/car-access.module';
import { DocumentModule } from '../document/document.module';
import { MaintenanceRecordModule } from '../maintenance-record/maintenance-record.module';
import { BootstrapController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [PrismaModule, CarModule, CarAccessModule, DocumentModule, MaintenanceRecordModule],
  controllers: [BootstrapController],
  providers: [BootstrapService],
})
export class BootstrapModule {}
