import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SaleContract, SaleContractParty, SaleContractPartySide, SaleContractStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import { StorageService } from '../storage/storage.service';
import { SaleContractPdfService } from './pdf/sale-contract-pdf.service';
import { priceInWords } from './pdf/price-in-words.util';
import { CreateSaleContractDto } from './dto/create-sale-contract.dto';
import { UpdateSaleContractDto } from './dto/update-sale-contract.dto';
import { GenerateSaleContractDto } from './dto/generate-sale-contract.dto';
import { SaleContractDto, SaleContractFileLinkDto, SaleContractSummaryDto } from './dto/sale-contract.dto';
import { SaveUserIdentityDto, UserIdentityDto } from './dto/user-identity.dto';
import { ContractPartyData, ContractVehicleData, SaleContractPdfData } from './sale-contract.types';

/** Days a generated contract keeps its personal data before the retention job erases it. */
const DEFAULT_RETENTION_DAYS = 90;
/** Days when the user explicitly opts to keep the contract in the car's history.
 *  Still bounded — "forever" is not a retention policy. */
const KEPT_RETENTION_DAYS = 5 * 365;

type ContractWithParties = SaleContract & { parties: SaleContractParty[] };

@Injectable()
export class SaleContractService {
    private readonly logger = new Logger(SaleContractService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly encryption: FieldEncryptionService,
        private readonly pdf: SaleContractPdfService,
        private readonly storage: StorageService,
        private readonly config: ConfigService,
    ) {}

    // -----------------------------------------------------------------------
    // Reads
    // -----------------------------------------------------------------------

    async list(googleId: string): Promise<SaleContractSummaryDto[]> {
        const rows = await this.prisma.saleContract.findMany({
            where: { user: { google_id: googleId } },
            orderBy: { created_at: 'desc' },
        });
        return rows.map((row) => this.toSummary(row));
    }

    async get(googleId: string, id: number): Promise<SaleContractDto> {
        const contract = await this.loadOwned(googleId, id);
        return this.toDetail(contract);
    }

    // -----------------------------------------------------------------------
    // Writes
    // -----------------------------------------------------------------------

    async create(googleId: string, dto: CreateSaleContractDto): Promise<SaleContractDto> {
        const user = await this.requireUser(googleId);
        if (dto.car_id !== undefined) await this.assertCarBelongsToUser(googleId, dto.car_id);

        const created = await this.prisma.saleContract.create({
            data: {
                user_id: user.id,
                car_id: dto.car_id ?? null,
                role: dto.role,
                ...this.vehicleColumns(dto.vehicle),
                ...this.priceColumns(dto.price_lei),
                signing_date: dto.signing_date ? new Date(dto.signing_date) : null,
                signing_place: dto.signing_place ?? null,
                has_annexes: dto.has_annexes ?? false,
                consent_version: dto.consent_version ?? null,
                consent_accepted_at: dto.consent_version ? new Date() : null,
                retention_until: this.retentionDeadline(dto.keep_in_history),
                parties: {
                    create: [
                        this.partyCreateInput(SaleContractPartySide.SELLER, dto.seller),
                        this.partyCreateInput(SaleContractPartySide.BUYER, dto.buyer),
                    ],
                },
            },
            include: { parties: true },
        });

        return this.toDetail(created);
    }

    async update(googleId: string, id: number, dto: UpdateSaleContractDto): Promise<SaleContractDto> {
        const existing = await this.loadOwned(googleId, id);
        if (existing.personal_data_purged_at) {
            throw new ForbiddenException(
                'The personal data on this contract has been erased, so it can no longer be edited.',
            );
        }
        if (dto.car_id !== undefined && dto.car_id !== null) await this.assertCarBelongsToUser(googleId, dto.car_id);

        await this.prisma.$transaction(async (tx) => {
            await tx.saleContract.update({
                where: { id },
                data: {
                    ...(dto.car_id !== undefined && { car_id: dto.car_id ?? null }),
                    ...(dto.role !== undefined && { role: dto.role }),
                    ...(dto.vehicle !== undefined && this.vehicleColumns(dto.vehicle)),
                    ...(dto.price_lei !== undefined && this.priceColumns(dto.price_lei)),
                    ...(dto.signing_date !== undefined && {
                        signing_date: dto.signing_date ? new Date(dto.signing_date) : null,
                    }),
                    ...(dto.signing_place !== undefined && { signing_place: dto.signing_place ?? null }),
                    ...(dto.has_annexes !== undefined && { has_annexes: dto.has_annexes }),
                    ...(dto.consent_version !== undefined && {
                        consent_version: dto.consent_version ?? null,
                        consent_accepted_at: dto.consent_version ? new Date() : null,
                    }),
                    ...(dto.keep_in_history !== undefined && {
                        retention_until: this.retentionDeadline(dto.keep_in_history),
                    }),
                },
            });

            for (const [side, party] of [
                [SaleContractPartySide.SELLER, dto.seller],
                [SaleContractPartySide.BUYER, dto.buyer],
            ] as const) {
                if (party === undefined) continue;
                const data = this.partyCreateInput(side, party);
                await tx.saleContractParty.upsert({
                    where: { contract_id_side: { contract_id: id, side } },
                    create: { ...data, contract_id: id },
                    update: { is_company: data.is_company, data_encrypted: data.data_encrypted },
                });
            }
        });

        return this.get(googleId, id);
    }

    /**
     * Produces the finished PDF, stores it and records what the user confirmed.
     *
     * The confirmations are validated at the DTO (each must be literally `true`),
     * so reaching this method already means the user was shown the section (5)
     * declarations and the disclaimer. We persist them with a timestamp because
     * the point of the checkpoint is being able to show, later, what was agreed
     * to and when.
     */
    async generate(googleId: string, id: number, dto: GenerateSaleContractDto): Promise<SaleContractFileLinkDto> {
        const contract = await this.loadOwned(googleId, id);
        if (contract.personal_data_purged_at) {
            throw new ForbiddenException(
                'The personal data on this contract has been erased, so it can no longer be generated.',
            );
        }

        const copies = dto.copies ?? 4;
        const pdfData = this.toPdfData(contract);
        const bytes = await this.pdf.generate(pdfData, { copies });

        const key = `sale-contracts/${contract.id}/${Date.now()}.pdf`;
        await this.storage.putObject(key, bytes, 'application/pdf');

        // A regenerated contract would otherwise leave its previous PDF behind,
        // and an orphaned object holding personal data is exactly what we must
        // not accumulate.
        if (contract.pdf_key && contract.pdf_key !== key) {
            await this.safeDeleteObject(contract.pdf_key);
        }

        await this.prisma.saleContract.update({
            where: { id },
            data: {
                status: SaleContractStatus.GENERATED,
                pdf_key: key,
                pdf_generated_at: new Date(),
                confirmations: {
                    ...dto.confirmations,
                    confirmed_at: new Date().toISOString(),
                } as unknown as Prisma.InputJsonValue,
                ...(dto.keep_in_history !== undefined && {
                    retention_until: this.retentionDeadline(dto.keep_in_history),
                }),
            },
        });

        this.logger.log(`Generated sale contract ${id} (${copies} copies, ${bytes.length} bytes)`);
        return this.buildFileLink(key, contract);
    }

    async getDownloadLink(googleId: string, id: number): Promise<SaleContractFileLinkDto> {
        const contract = await this.loadOwned(googleId, id);
        if (!contract.pdf_key) {
            throw new NotFoundException('This contract has not been generated yet.');
        }
        return this.buildFileLink(contract.pdf_key, contract);
    }

    /**
     * A real delete, not a soft one. A user asking for their contract to be
     * removed is exercising a right, and a row that still holds an encrypted CNP
     * has not been removed.
     */
    async remove(googleId: string, id: number): Promise<void> {
        const contract = await this.loadOwned(googleId, id);
        if (contract.pdf_key) await this.safeDeleteObject(contract.pdf_key);
        await this.prisma.saleContract.delete({ where: { id } });
        this.logger.log(`Deleted sale contract ${id} and its stored PDF`);
    }

    // -----------------------------------------------------------------------
    // The user's own saved identity
    // -----------------------------------------------------------------------

    async getMyIdentity(googleId: string): Promise<UserIdentityDto> {
        const row = await this.prisma.userIdentity.findFirst({ where: { user: { google_id: googleId } } });
        if (!row) return { identity: null, updated_at: null };
        return {
            identity: this.encryption.decryptObject<ContractPartyData>(row.data_encrypted) as never,
            updated_at: row.updated_at,
        };
    }

    async saveMyIdentity(googleId: string, dto: SaveUserIdentityDto): Promise<UserIdentityDto> {
        const user = await this.requireUser(googleId);
        const blob = this.encryption.encryptObject(dto.identity);
        const row = await this.prisma.userIdentity.upsert({
            where: { user_id: user.id },
            create: { user_id: user.id, data_encrypted: blob },
            update: { data_encrypted: blob },
        });
        return { identity: dto.identity as never, updated_at: row.updated_at };
    }

    async deleteMyIdentity(googleId: string): Promise<void> {
        const user = await this.requireUser(googleId);
        await this.prisma.userIdentity.deleteMany({ where: { user_id: user.id } });
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    private async requireUser(googleId: string) {
        const user = await this.prisma.user.findUnique({ where: { google_id: googleId }, select: { id: true } });
        if (!user) throw new NotFoundException('User not found.');
        return user;
    }

    /**
     * Contracts are never shared, not even with someone who has access to the
     * car: they hold a third party's identity details, and sharing a car was
     * never consent to see those. So ownership, not car access, is the check.
     */
    private async loadOwned(googleId: string, id: number): Promise<ContractWithParties> {
        const contract = await this.prisma.saleContract.findFirst({
            where: { id, user: { google_id: googleId } },
            include: { parties: true },
        });
        if (!contract) throw new NotFoundException('Sale contract not found.');
        return contract;
    }

    private async assertCarBelongsToUser(googleId: string, carId: number): Promise<void> {
        const car = await this.prisma.car.findFirst({
            where: { id: carId, user: { google_id: googleId } },
            select: { id: true },
        });
        if (!car) throw new ForbiddenException('That car does not belong to you.');
    }

    private retentionDeadline(keepInHistory?: boolean): Date {
        const days = keepInHistory
            ? Number(this.config.get<string>('CONTRACT_KEPT_RETENTION_DAYS') ?? KEPT_RETENTION_DAYS)
            : Number(this.config.get<string>('CONTRACT_RETENTION_DAYS') ?? DEFAULT_RETENTION_DAYS);
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + days);
        return deadline;
    }

    private partyCreateInput(side: SaleContractPartySide, party: ContractPartyData) {
        return {
            side,
            is_company: party.is_company ?? false,
            data_encrypted: this.encryption.encryptObject(party),
        };
    }

    private vehicleColumns(vehicle: ContractVehicleData) {
        return {
            vehicle_make: vehicle.make ?? null,
            vehicle_type: vehicle.type ?? null,
            vin: vehicle.vin ?? null,
            engine_series: vehicle.engine_series ?? null,
            engine_capacity_cm3: vehicle.engine_capacity_cm3 ?? null,
            max_weight_tons: vehicle.max_weight_tons ?? null,
            license_plate: vehicle.license_plate ?? null,
            itp_expiry_date: vehicle.itp_expiry_date ? new Date(vehicle.itp_expiry_date) : null,
            civ_number: vehicle.civ_number ?? null,
            manufacture_year: vehicle.manufacture_year ?? null,
            euro_norm: vehicle.euro_norm ?? null,
            acquired_date: vehicle.acquired_date ? new Date(vehicle.acquired_date) : null,
            acquired_document: vehicle.acquired_document ?? null,
        };
    }

    /** The words version is derived, never user-supplied — the two must agree. */
    private priceColumns(priceLei?: number) {
        if (priceLei === undefined || priceLei === null) {
            return { price_lei: null, price_in_words: null };
        }
        return { price_lei: new Prisma.Decimal(priceLei), price_in_words: priceInWords(priceLei) };
    }

    private decryptParty(contract: ContractWithParties, side: SaleContractPartySide): ContractPartyData | null {
        const row = contract.parties.find((p) => p.side === side);
        if (!row?.data_encrypted) return null;
        return this.encryption.decryptObject<ContractPartyData>(row.data_encrypted);
    }

    private toVehicle(contract: SaleContract): ContractVehicleData {
        return {
            make: contract.vehicle_make ?? undefined,
            type: contract.vehicle_type ?? undefined,
            vin: contract.vin ?? undefined,
            engine_series: contract.engine_series ?? undefined,
            engine_capacity_cm3: contract.engine_capacity_cm3 ?? undefined,
            max_weight_tons: contract.max_weight_tons ? Number(contract.max_weight_tons) : undefined,
            license_plate: contract.license_plate ?? undefined,
            itp_expiry_date: contract.itp_expiry_date?.toISOString().slice(0, 10),
            civ_number: contract.civ_number ?? undefined,
            manufacture_year: contract.manufacture_year ?? undefined,
            euro_norm: contract.euro_norm ?? undefined,
            acquired_date: contract.acquired_date?.toISOString().slice(0, 10),
            acquired_document: contract.acquired_document ?? undefined,
        };
    }

    private toPdfData(contract: ContractWithParties): SaleContractPdfData {
        const seller = this.decryptParty(contract, SaleContractPartySide.SELLER);
        const buyer = this.decryptParty(contract, SaleContractPartySide.BUYER);
        return {
            seller: seller ?? { is_company: false },
            buyer: buyer ?? { is_company: false },
            vehicle: this.toVehicle(contract),
            price_lei: contract.price_lei ? Number(contract.price_lei) : undefined,
            price_in_words: contract.price_in_words ?? undefined,
            signing_date: contract.signing_date?.toISOString().slice(0, 10),
            signing_place: contract.signing_place ?? undefined,
            has_annexes: contract.has_annexes,
        };
    }

    private toSummary(contract: SaleContract): SaleContractSummaryDto {
        return {
            id: contract.id,
            role: contract.role,
            car_id: contract.car_id,
            vehicle_make: contract.vehicle_make,
            license_plate: contract.license_plate,
            price_lei: contract.price_lei ? Number(contract.price_lei) : null,
            signing_date: contract.signing_date,
            status: contract.status,
            pdf_generated_at: contract.pdf_generated_at,
            retention_until: contract.retention_until,
            has_personal_data: contract.personal_data_purged_at === null,
            created_at: contract.created_at,
        };
    }

    private toDetail(contract: ContractWithParties): SaleContractDto {
        return {
            ...this.toSummary(contract),
            seller: this.decryptParty(contract, SaleContractPartySide.SELLER) as never,
            buyer: this.decryptParty(contract, SaleContractPartySide.BUYER) as never,
            vehicle: this.toVehicle(contract) as never,
            price_in_words: contract.price_in_words,
            signing_place: contract.signing_place,
            has_annexes: contract.has_annexes,
            confirmations: (contract.confirmations as Record<string, unknown> | null) ?? null,
            consent_accepted_at: contract.consent_accepted_at,
        };
    }

    private async buildFileLink(key: string, contract: SaleContract): Promise<SaleContractFileLinkDto> {
        const plate = contract.license_plate ? ` ${contract.license_plate}` : '';
        const fileName = `Contract instrainare-dobandire${plate}.pdf`;
        const expiresIn = Number(this.config.get<string>('R2_SIGNED_URL_EXPIRY') ?? '3600');
        const url = await this.storage.createPresignedGetUrl(key, expiresIn, fileName);
        return { url, file_name: fileName, expires_in: expiresIn };
    }

    /** A storage object that refuses to disappear must not block the database
     *  change that removes the user's data — log it and carry on. */
    private async safeDeleteObject(key: string): Promise<void> {
        try {
            await this.storage.deleteObject(key);
        } catch (err) {
            this.logger.error(`Could not delete stored contract object ${key}: ${(err as Error).message}`);
        }
    }
}
