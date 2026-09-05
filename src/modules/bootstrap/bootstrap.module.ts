import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CarModule } from '../car/car.module';
import { CarAccessModule } from '../car-access/car-access.module';
import { DocumentModule } from '../document/document.module';
import { MaintenanceRecordModule } from '../maintenance-record/maintenance-record.module';
import { CarMaintenanceSettingsModule } from '../car-maintenance-settings/car-maintenance-settings.module';
import { CarMaintenanceProfilesModule } from '../car-maintenance-profiles/car-maintenance-profiles.module';
import { BootstrapController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [PrismaModule, CarModule, CarAccessModule, DocumentModule, MaintenanceRecordModule, CarMaintenanceSettingsModule, CarMaintenanceProfilesModule],
  controllers: [BootstrapController],
  providers: [BootstrapService],
})
export class BootstrapModule {}
