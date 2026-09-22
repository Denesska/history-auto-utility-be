import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SaleContractStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/**
 * Erases the personal data on sale contracts once their retention window closes.
 *
 * A contract needs the parties' names, addresses, ID numbers and CNPs only for as
 * long as it takes to produce and file it. Keeping them indefinitely would mean
 * holding a third party's identity details — someone who is not our user — with
 * no purpose left to justify it, which is precisely what data minimisation and
 * storage limitation forbid. So the data has an expiry date from the moment it
 * is entered, and this job enforces it without anyone having to remember.
 *
 * What survives is deliberately non-identifying: the vehicle, the price and the
 * date, so the car's history still shows that a sale happened. The row is marked
 * PURGED rather than deleted, so the history does not silently develop holes.
 */
@Injectable()
export class SaleContractRetentionService {
    private readonly logger = new Logger(SaleContractRetentionService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: StorageService,
    ) {}

    /** 03:15 daily — off-peak, and deliberately not on the hour so it doesn't
     *  contend with every other cron in the system. */
    @Cron('15 3 * * *')
    async purgeExpiredContracts(): Promise<void> {
        const due = await this.prisma.saleContract.findMany({
            where: {
                retention_until: { lt: new Date() },
                personal_data_purged_at: null,
            },
            select: { id: true, pdf_key: true },
        });

        if (due.length === 0) return;
        this.logger.log(`Retention: purging personal data from ${due.length} sale contract(s)`);

        let purged = 0;
        for (const contract of due) {
            try {
                await this.purgeOne(contract.id, contract.pdf_key);
                purged += 1;
            } catch (err) {
                // One stubborn row must not stop the rest of the sweep — the whole
                // point is that this runs unattended. It will be retried tomorrow.
                this.logger.error(`Retention: failed to purge contract ${contract.id}: ${(err as Error).message}`);
            }
        }

        this.logger.log(`Retention: purged ${purged}/${due.length} sale contract(s)`);
    }

    private async purgeOne(id: number, pdfKey: string | null): Promise<void> {
        // The stored PDF holds the same data in visible form, so it goes first.
        // If it cannot be removed we stop rather than mark the row purged — a row
        // claiming the data is gone while the file still sits in the bucket is
        // worse than a row that gets retried.
        if (pdfKey) await this.storage.deleteObject(pdfKey);

        await this.prisma.$transaction([
            this.prisma.saleContractParty.updateMany({
                where: { contract_id: id },
                data: { data_encrypted: null },
            }),
            this.prisma.saleContract.update({
                where: { id },
                data: {
                    status: SaleContractStatus.PURGED,
                    personal_data_purged_at: new Date(),
                    pdf_key: null,
                    // The consent record goes with the data it covered; keeping a
                    // timestamp tied to erased details serves nothing.
                    consent_accepted_at: null,
                    consent_version: null,
                },
            }),
        ]);
    }
}
