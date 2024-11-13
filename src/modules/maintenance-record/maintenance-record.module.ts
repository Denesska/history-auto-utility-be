import { Module } from '@nestjs/common';
import { MaintenanceRecordController } from './maintenance-record.controller';
import { MaintenanceRecordService } from './maintenance-record.service';
import {PrismaModule} from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [MaintenanceRecordController],
  providers: [MaintenanceRecordService],
})
export class MaintenanceRecordModule {}
