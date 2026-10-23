import { Module } from '@nestjs/common';
import { ExchangeRateController } from './exchange-rate.controller';
import { ExchangeRateService } from './exchange-rate.service';

/** Official BNR exchange rates (RON per foreign unit). Reusable — import where needed. */
@Module({
    controllers: [ExchangeRateController],
    providers: [ExchangeRateService],
    exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
