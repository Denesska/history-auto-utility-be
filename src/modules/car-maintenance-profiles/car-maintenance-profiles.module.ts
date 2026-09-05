import { Module } from '@nestjs/common';
import { CarMaintenanceProfilesController } from './car-maintenance-profiles.controller';
import { CarMaintenanceProfilesService } from './car-maintenance-profiles.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CarMaintenanceProfilesController],
  providers: [CarMaintenanceProfilesService],
  exports: [CarMaintenanceProfilesService],
})
export class CarMaintenanceProfilesModule {}
