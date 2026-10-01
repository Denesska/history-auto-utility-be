import { Module } from '@nestjs/common';
import { CarMaintenanceSettingsController } from './car-maintenance-settings.controller';
import { CarMaintenanceSettingsService } from './car-maintenance-settings.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CarAccessModule } from '../car-access/car-access.module';

@Module({
  imports: [PrismaModule, CarAccessModule],
  controllers: [CarMaintenanceSettingsController],
  providers: [CarMaintenanceSettingsService],
  exports: [CarMaintenanceSettingsService],
})
export class CarMaintenanceSettingsModule {}
