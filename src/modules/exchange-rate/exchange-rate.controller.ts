import { BadRequestException, Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Scope } from '../../common/context/scope.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExchangeRateService } from './exchange-rate.service';

export interface CrossRateDto {
    /** Units of `to` per 1 unit of `from` (cross rate through RON). */
    rate: number;
    /** Older of the two BNR publication dates used (YYYY-MM-DD). */
    date: string;
    source: 'BNR';
}

const CURRENCY_RE = /^[A-Za-z]{3}$/;

@ApiTags('exchange-rate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Scope('personal', 'business')
@Controller('exchange-rate')
export class ExchangeRateController {
    constructor(private readonly exchangeRates: ExchangeRateService) {}

    @Get()
    @ApiOperation({ summary: 'BNR cross rate between two currencies on a date (via RON)' })
    @ApiQuery({ name: 'from', example: 'EUR' })
    @ApiQuery({ name: 'to', example: 'MDL' })
    @ApiQuery({ name: 'date', example: '2026-10-23', required: false })
    async getRate(@Query('from') from: string, @Query('to') to: string, @Query('date') date?: string): Promise<CrossRateDto> {
        if (!CURRENCY_RE.test(from ?? '') || !CURRENCY_RE.test(to ?? '')) throw new BadRequestException('from and to must be 3-letter currency codes');
        let onDate = new Date();
        if (date) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new BadRequestException('date must be YYYY-MM-DD');
            onDate = new Date(date);
        }
        const src = from.toUpperCase();
        const dst = to.toUpperCase();
        const [a, b] = await Promise.all([this.exchangeRates.getRonRate(src, onDate), this.exchangeRates.getRonRate(dst, onDate)]);
        if (!a || !b) throw new NotFoundException(`No BNR rate available for ${src}/${dst}`);
        const rate = Math.round((a.rate / b.rate) * 1e8) / 1e8;
        const d = a.date < b.date ? a.date : b.date;
        return { rate, date: d.toISOString().slice(0, 10), source: 'BNR' };
    }
}
