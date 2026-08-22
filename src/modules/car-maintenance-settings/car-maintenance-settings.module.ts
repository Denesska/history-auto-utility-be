import { Module } from '@nestjs/common';
import { CarMaintenanceSettingsController } from './car-maintenance-settings.controller';
import { CarMaintenanceSettingsService } from './car-maintenance-settings.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CarMaintenanceSettingsController],
  providers: [CarMaintenanceSettingsService],
  exports: [CarMaintenanceSettingsService],
})
export class CarMaintenanceSettingsModule {}
