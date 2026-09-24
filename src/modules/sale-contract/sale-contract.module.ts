import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { StorageModule } from '../storage/storage.module';
import { SaleContractPdfModule } from './pdf/sale-contract-pdf.module';
import { ExtractionModule } from './extraction/extraction.module';
import { SaleContractController } from './sale-contract.controller';
import { SaleContractService } from './sale-contract.service';
import { SaleContractRetentionService } from './sale-contract-retention.service';

@Module({
    imports: [PrismaModule, CryptoModule, StorageModule, SaleContractPdfModule, ExtractionModule],
    controllers: [SaleContractController],
    providers: [SaleContractService, SaleContractRetentionService],
    exports: [SaleContractService],
})
export class SaleContractModule {}
