import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { DocumentExtractionService } from './document-extraction.service';
import { GeminiExtractionService } from './gemini-extraction.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
    imports: [PrismaModule, StorageModule],
    controllers: [DocumentController],
    providers: [DocumentService, DocumentExtractionService, GeminiExtractionService],
    exports: [DocumentService],
})
export class DocumentModule {}
