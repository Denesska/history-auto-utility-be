import { Module } from '@nestjs/common';
import { CarMaintenanceProfilesController } from './car-maintenance-profiles.controller';
import { CarMaintenanceProfilesService } from './car-maintenance-profiles.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CarAccessModule } from '../car-access/car-access.module';

@Module({
  imports: [PrismaModule, CarAccessModule],
  controllers: [CarMaintenanceProfilesController],
  providers: [CarMaintenanceProfilesService],
  exports: [CarMaintenanceProfilesService],
})
export class CarMaintenanceProfilesModule {}
