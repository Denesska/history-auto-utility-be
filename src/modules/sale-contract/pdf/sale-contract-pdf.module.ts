import { Module } from '@nestjs/common';
import { SaleContractPdfService } from './sale-contract-pdf.service';

/**
 * The PDF half of the sale-contract feature, kept as its own module so that the
 * filler can be imported by the API layer without dragging in persistence or
 * the identity-extraction providers.
 *
 * Registering this in `app.module.ts` is the job of the feature module that
 * owns the endpoints.
 */
@Module({
    providers: [SaleContractPdfService],
    exports: [SaleContractPdfService],
})
export class SaleContractPdfModule {}
