import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { DocumentExtractionService } from './document-extraction.service';
import { GeminiExtractionService } from './gemini-extraction.service';
import { CloudflareExtractionService } from './cloudflare-extraction.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
import { CarAccessModule } from '../car-access/car-access.module';
import { SupplierModule } from '../supplier/supplier.module';

@Module({
    imports: [PrismaModule, StorageModule, ExchangeRateModule, CarAccessModule, SupplierModule],
    controllers: [DocumentController],
    providers: [DocumentService, DocumentExtractionService, GeminiExtractionService, CloudflareExtractionService],
    exports: [DocumentService],
})
export class DocumentModule {}
