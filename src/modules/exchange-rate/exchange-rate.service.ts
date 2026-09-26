import { Injectable, Logger } from '@nestjs/common';

export interface RonRate {
    /** RON per 1 unit of the currency (BNR `multiplier` already divided out). */
    rate: number;
    /** BNR publication date of the rate (the `<Cube date>`), UTC midnight. */
    date: Date;
}

interface RateDay {
    date: Date;
    rates: Map<string, number>;
}

interface YearSnapshot {
    /** Banking days of the year, oldest first. */
    days: RateDay[];
    fetchedAt: number;
}

/**
 * BNR serves one XML per year with every banking day's rates, the current year
 * included (up to the latest published day). `curs.bnr.ro` is the host that
 * actually serves the XML — `www.bnr.ro/...` now redirects to the HTML homepage
 * (checked 2026-09-26). The daily feed is kept as a fallback for "latest".
 */
const YEAR_FEED_URL = (year: number) => `https://curs.bnr.ro/files/xml/years/nbrfxrates${year}.xml`;
const DAILY_FEED_URLS = ['https://curs.bnr.ro/nbrfxrates.xml', 'https://www.bnr.ro/nbrfxrates.xml'];
const FETCH_TIMEOUT_MS = 8000;
/** The current year's file grows once per banking day (~13:00 RO time); past years never change. */
const CURRENT_YEAR_TTL_MS = 3 * 60 * 60 * 1000;
/** After a failed fetch, don't retry (and make every save wait out the timeout) for a while. */
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;
/** BNR's archive starts in 2005 (post-denomination RON). */
const FIRST_YEAR = 2005;

/**
 * Official BNR (Banca Națională a României) exchange rates, as RON per one unit of
 * a foreign currency, **on a given date**: the rate BNR published that day, or —
 * for a weekend/holiday — the last one published before it (the rate in force
 * then). Year files are cached in memory (past years for good). Never throws —
 * returns null when a rate can't be obtained, and callers decide what to do.
 */
@Injectable()
export class ExchangeRateService {
    private readonly logger = new Logger(ExchangeRateService.name);
    private readonly years = new Map<number, YearSnapshot>();
    private readonly inFlight = new Map<number, Promise<YearSnapshot | null>>();
    private readonly lastFailureAt = new Map<number, number>();

    /**
     * BNR rate for `currency` in force on `onDate` (default: today). A future date
     * gets the latest published rate. RON → rate 1.
     */
    async getRonRate(currency: string, onDate: Date = new Date()): Promise<RonRate | null> {
        const code = currency?.trim().toUpperCase();
        if (!code) return null;
        const target = startOfDayUtc(onDate);
        if (code === 'RON') return { rate: 1, date: target };

        const today = startOfDayUtc(new Date());
        const lookup = target > today ? today : target;

        // Walk back at most one year boundary: Jan 1–2 have no fixing, so their
        // rate is the previous year's last one.
        for (let year = lookup.getUTCFullYear(); year >= Math.max(FIRST_YEAR, lookup.getUTCFullYear() - 1); year--) {
            const snapshot = await this.getYear(year);
            if (!snapshot) {
                if (year === today.getUTCFullYear()) return this.fromDailyFeed(code);
                return null;
            }
            const day = lastDayOnOrBefore(snapshot.days, lookup);
            if (!day) continue;
            const rate = day.rates.get(code);
            if (rate === undefined) {
                this.logger.warn(`BNR has no ${code} rate on ${iso(day.date)}`);
                return null;
            }
            return { rate, date: day.date };
        }
        return null;
    }

    private async getYear(year: number): Promise<YearSnapshot | null> {
        const now = Date.now();
        const cached = this.years.get(year);
        const isCurrentYear = year === new Date().getUTCFullYear();
        if (cached && (!isCurrentYear || now - cached.fetchedAt < CURRENT_YEAR_TTL_MS)) return cached;
        if (now - (this.lastFailureAt.get(year) ?? 0) < FAILURE_BACKOFF_MS) return cached ?? null;

        let pending = this.inFlight.get(year);
        if (!pending) {
            pending = this.fetchYear(year).finally(() => this.inFlight.delete(year));
            this.inFlight.set(year, pending);
        }
        const fresh = await pending;
        if (fresh) return fresh;
        if (cached) this.logger.warn(`Using stale BNR rates for ${year} (fetched ${new Date(cached.fetchedAt).toISOString()})`);
        return cached ?? null;
    }

    private async fetchYear(year: number): Promise<YearSnapshot | null> {
        const url = YEAR_FEED_URL(year);
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const days = parseBnrXml(await res.text());
            if (!days.length) throw new Error('response is not a BNR rates document');
            const snapshot: YearSnapshot = { days, fetchedAt: Date.now() };
            this.years.set(year, snapshot);
            this.lastFailureAt.delete(year);
            this.logger.log(`Loaded BNR rates for ${year}: ${days.length} days, latest ${iso(days[days.length - 1].date)}`);
            return snapshot;
        } catch (err) {
            this.lastFailureAt.set(year, Date.now());
            this.logger.warn(`BNR rates fetch failed (${url}): ${(err as Error).message}`);
            return null;
        }
    }

    /** Last resort for "today" when the year file is unreachable. */
    private async fromDailyFeed(code: string): Promise<RonRate | null> {
        for (const url of DAILY_FEED_URLS) {
            try {
                const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const day = parseBnrXml(await res.text()).pop();
                const rate = day?.rates.get(code);
                if (day && rate !== undefined) return { rate, date: day.date };
            } catch (err) {
                this.logger.warn(`BNR daily feed failed (${url}): ${(err as Error).message}`);
            }
        }
        return null;
    }
}

/**
 * Parses a BNR rates XML — the daily feed (one `<Cube>`) or a year file (one per
 * banking day):
 *   <Cube date="2026-09-25"><Rate currency="EUR">5.2718</Rate><Rate currency="HUF" multiplier="100">1.4455</Rate>…</Cube>
 * Returns the days oldest first. The documents are flat and machine-generated, so
 * a regex pass is enough — no XML dependency. Exported for tests.
 */
export function parseBnrXml(xml: string): RateDay[] {
    const days: RateDay[] = [];
    const cubeRe = /<Cube\s+date="(\d{4})-(\d{2})-(\d{2})"\s*>([\s\S]*?)<\/Cube>/g;
    let cube: RegExpExecArray | null;
    while ((cube = cubeRe.exec(xml))) {
        const rates = new Map<string, number>();
        const rateRe = /<Rate\s+([^>]*)>\s*([\d.]+)\s*<\/Rate>/g;
        let m: RegExpExecArray | null;
        while ((m = rateRe.exec(cube[4]))) {
            const currency = /currency="([A-Z]{3})"/.exec(m[1])?.[1];
            if (!currency) continue;
            const multiplier = Number(/multiplier="(\d+)"/.exec(m[1])?.[1] ?? '1');
            const value = Number(m[2]);
            if (!Number.isFinite(value) || value <= 0 || !multiplier) continue;
            rates.set(currency, Math.round((value / multiplier) * 1e8) / 1e8); // strip float noise from the division
        }
        if (rates.size) days.push({ date: new Date(Date.UTC(+cube[1], +cube[2] - 1, +cube[3])), rates });
    }
    return days.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function lastDayOnOrBefore(days: RateDay[], target: Date): RateDay | undefined {
    for (let i = days.length - 1; i >= 0; i--) {
        if (days[i].date.getTime() <= target.getTime()) return days[i];
    }
    return undefined;
}

function startOfDayUtc(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function iso(d: Date): string {
    return d.toISOString().slice(0, 10);
}
