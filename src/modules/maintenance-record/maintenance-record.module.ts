import { Module } from '@nestjs/common';
import { MaintenanceRecordController } from './maintenance-record.controller';
import { MaintenanceRecordService } from './maintenance-record.service';
import {PrismaModule} from "../../prisma/prisma.module";
import { UploadModule } from '../upload/upload.module';
import { CategorySuggestionService } from './category-suggestion.service';
import { CarAccessModule } from '../car-access/car-access.module';
import { SupplierModule } from '../supplier/supplier.module';
import { InvoiceExtractionService } from './invoice-extraction/invoice-extraction.service';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';

@Module({
  imports: [PrismaModule, UploadModule, CarAccessModule, SupplierModule, ExchangeRateModule],
  controllers: [MaintenanceRecordController],
  providers: [MaintenanceRecordService, CategorySuggestionService, InvoiceExtractionService],
  exports: [MaintenanceRecordService],
})
export class MaintenanceRecordModule {}
