import { Module } from '@nestjs/common';
import { MaintenanceRecordController } from './maintenance-record.controller';
import { MaintenanceRecordService } from './maintenance-record.service';
import {PrismaModule} from "../../prisma/prisma.module";
import { UploadModule } from '../upload/upload.module';
import { CategorySuggestionService } from './category-suggestion.service';

@Module({
  imports: [PrismaModule, UploadModule],
  controllers: [MaintenanceRecordController],
  providers: [MaintenanceRecordService, CategorySuggestionService],
  exports: [MaintenanceRecordService],
})
export class MaintenanceRecordModule {}
