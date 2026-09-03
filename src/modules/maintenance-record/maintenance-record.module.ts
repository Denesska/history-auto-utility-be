import { Module } from '@nestjs/common';
import { MaintenanceRecordController } from './maintenance-record.controller';
import { MaintenanceRecordService } from './maintenance-record.service';
import {PrismaModule} from "../../prisma/prisma.module";
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [PrismaModule, UploadModule],
  controllers: [MaintenanceRecordController],
  providers: [MaintenanceRecordService],
  exports: [MaintenanceRecordService],
})
export class MaintenanceRecordModule {}
