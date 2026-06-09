import { Module } from '@nestjs/common';
import { CarModule } from '../car/car.module';
import { CarAccessModule } from '../car-access/car-access.module';
import { DocumentModule } from '../document/document.module';
import { MaintenanceRecordModule } from '../maintenance-record/maintenance-record.module';
import { BootstrapController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [CarModule, CarAccessModule, DocumentModule, MaintenanceRecordModule],
  controllers: [BootstrapController],
  providers: [BootstrapService],
})
export class BootstrapModule {}
