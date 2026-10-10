import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminGuard } from '../admin/admin.guard';
import { VehicleSilhouetteController } from './vehicle-silhouette.controller';
import { VehicleSilhouetteService } from './vehicle-silhouette.service';

@Module({
  imports: [PrismaModule],
  controllers: [VehicleSilhouetteController],
  providers: [VehicleSilhouetteService, AdminGuard],
})
export class VehicleSilhouetteModule {}
