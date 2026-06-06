import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { DocumentExtractionService } from './document-extraction.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [DocumentController],
    providers: [DocumentService, DocumentExtractionService],
})
export class DocumentModule {}
