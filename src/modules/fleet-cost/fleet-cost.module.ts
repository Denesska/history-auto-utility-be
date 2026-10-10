import { Module } from '@nestjs/common';
import { FleetCostController } from './fleet-cost.controller';
import { FleetCostService } from './fleet-cost.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FleetCostController],
  providers: [FleetCostService],
})
export class FleetCostModule {}
