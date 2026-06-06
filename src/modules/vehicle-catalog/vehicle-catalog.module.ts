import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { VehicleCatalogController } from './vehicle-catalog.controller';
import { VehicleCatalogService } from './vehicle-catalog.service';

@Module({
  imports: [PrismaModule],
  controllers: [VehicleCatalogController],
  providers: [VehicleCatalogService],
})
export class VehicleCatalogModule {}
