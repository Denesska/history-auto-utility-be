import { Module } from '@nestjs/common';
import { MaintenanceRecordController } from './maintenance-record.controller';
import { MaintenanceRecordService } from './maintenance-record.service';
import {PrismaModule} from "../../prisma/prisma.module";
import { UploadModule } from '../upload/upload.module';
import { CategorySuggestionService } from './category-suggestion.service';
import { CarAccessModule } from '../car-access/car-access.module';

@Module({
  imports: [PrismaModule, UploadModule, CarAccessModule],
  controllers: [MaintenanceRecordController],
  providers: [MaintenanceRecordService, CategorySuggestionService],
  exports: [MaintenanceRecordService],
})
export class MaintenanceRecordModule {}
