import { Module } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';

/** Official BNR exchange rates (RON per foreign unit). Reusable — import where needed. */
@Module({
    providers: [ExchangeRateService],
    exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
