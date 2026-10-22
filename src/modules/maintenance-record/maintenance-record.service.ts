import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MaintenanceRecord, MaintenancePart, MaintenanceRecordPlanItem, PlanItemKey, ServiceCategory } from '@prisma/client';
import {PrismaService} from "../../prisma/prisma.service";
import {CreateMaintenanceRecordDto} from "./dto/create-maintenance-record.dto";
import {UpdateMaintenanceRecordDto} from "./dto/update-maintenance-record.dto";
import { UploadService } from '../upload/upload.service';
import { CarAccessService } from '../car-access/car-access.service';
import { SupplierService } from '../supplier/supplier.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { deriveCategoryFromItems } from './plan-item.catalog';
import { sanitizeCustomItems } from './custom-items.util';

export type MaintenanceRecordWithParts = MaintenanceRecord & { parts: MaintenancePart[]; plan_items: PlanItemKey[] };

/** Prisma include used everywhere a record is read: parts + the raw plan-item junction rows. */
const RECORD_INCLUDE = { parts: true, plan_items: true } as const;
type RecordRow = MaintenanceRecord & { parts: MaintenancePart[]; plan_items: MaintenanceRecordPlanItem[] };

/** Flattens the junction rows into the API shape: `plan_items: PlanItemKey[]`. */
function withPlanItems(row: RecordRow): MaintenanceRecordWithParts {
    return { ...row, plan_items: row.plan_items.map(i => i.item) };
}
export type MaintenanceRecordWithMeta = MaintenanceRecordWithParts & {
    attachmentsCount: number;
    invoicesCount: number;
    thumbnailUrl: string | null;
    consumption_l_100km?: number;
    consumption_kwh_100km?: number;
};

/** The four columns that record a maintenance cost's RON equivalent — same shape as Document's. */
type CostConversion = Pick<MaintenanceRecord, 'cost_ron' | 'exchange_rate' | 'exchange_rate_date' | 'exchange_rate_source'>;

const NO_CONVERSION: CostConversion = { cost_ron: null, exchange_rate: null, exchange_rate_date: null, exchange_rate_source: null };

/** Create: items decide the category (fuel entries keep theirs); no items -> the sent category, else OTHER. */
function resolveCreateCategory(sent: ServiceCategory | undefined, items: PlanItemKey[] | undefined): ServiceCategory {
    if (sent === ServiceCategory.COMBUSTIBIL) return sent;
    return (items?.length ? deriveCategoryFromItems(items) : null) ?? sent ?? ServiceCategory.OTHER;
}

@Injectable()
export class MaintenanceRecordService {
    private readonly logger = new Logger(MaintenanceRecordService.name);

    constructor(
        private prisma: PrismaService,
        private uploadService: UploadService,
        private carAccess: CarAccessService,
        private supplierService: SupplierService,
        private exchangeRates: ExchangeRateService,
    ) {}

    async createMaintenanceRecord(data: CreateMaintenanceRecordDto, userId: number): Promise<MaintenanceRecordWithParts> {
        await this.carAccess.assertHasAccess(data.car_id, userId);
        const supplierId = (await this.supplierService.resolveLinkedSupplierId(data.supplier_id, userId)) ?? null;
        const conversion = await this.convertCost(data.cost, data.currency ?? null, new Date(data.service_date));
        const record = await this.prisma.maintenanceRecord.create({
            data: {
                car_id:           data.car_id,
                service_date:     new Date(data.service_date),
                mileage:          data.mileage,
                description:      data.description,
                service_type:     data.service_type,
                service_category: resolveCreateCategory(data.service_category, data.plan_items),
                cost:             data.cost,
                currency:         normalizeCurrency(data.currency),
                ...conversion,
                expiry_date:      data.expiry_date ? new Date(data.expiry_date) : null,
                reminder_title:   data.expiry_date ? (data.reminder_title?.trim() || null) : null,
                is_diy:           data.is_diy ?? false,
                fuel_liters:        data.fuel_liters,
                energy_kwh:         data.energy_kwh,
                is_company_expense: data.is_company_expense ?? false,
                labor_cost:         data.labor_cost,
                ...partsCostFields(data),
                notes:              data.notes,
                supplier_id:        supplierId,
                service_name:       supplierId != null ? null : (data.service_name?.trim() || null),
                custom_items:       sanitizeCustomItems(data.custom_items),
                parts: data.parts?.length
                    ? { create: data.parts.map(p => ({ name: p.name, code: p.code, quantity: p.quantity, price: p.price, currency: p.currency ?? null })) }
                    : undefined,
                plan_items: data.plan_items?.length
                    ? { create: [...new Set(data.plan_items)].map(item => ({ item })) }
                    : undefined,
            },
            include: RECORD_INCLUDE,
        });
        await this._syncLastOilService(record.car_id);
        await this._syncActualMileage(record.car_id, record.mileage);
        return this._attachConsumptionSingle(withPlanItems(record));
    }

    async getMaintenanceRecord(id: number, userId: number): Promise<MaintenanceRecordWithParts | null> {
        const record = await this.prisma.maintenanceRecord.findUnique({
            where: { id },
            include: RECORD_INCLUDE,
        });
        if (!record) return null;
        await this.assertAccessOrNotFound(record.car_id, userId);
        return withPlanItems(record);
    }

    async updateMaintenanceRecord(id: number, data: UpdateMaintenanceRecordDto, userId: number): Promise<MaintenanceRecordWithParts> {
        const existing = await this.prisma.maintenanceRecord.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Maintenance record not found');
        await this.assertAccessOrNotFound(existing.car_id, userId);
        const supplierId = await this.supplierService.resolveLinkedSupplierId(data.supplier_id, userId);

        // Parts have no stable client-side id to diff against, so an edit replaces
        // the whole set rather than trying to patch individual rows.
        if (data.parts !== undefined) {
            await this.prisma.maintenancePart.deleteMany({ where: { maintenance_record_id: id } });
        }
        const conversion = await this.recomputeConversionForUpdate(id, data);
        // Category is only for cost reports / history icons: always derived from the ticked items when
        // there are any (fuel entries keep theirs); otherwise left as sent / unchanged.
        const isFuel = existing.service_category === ServiceCategory.COMBUSTIBIL || data.service_category === ServiceCategory.COMBUSTIBIL;
        const derivedCategory = !isFuel && data.plan_items?.length ? deriveCategoryFromItems(data.plan_items) : null;
        const record = await this.prisma.maintenanceRecord.update({
            where: { id },
            data: {
                car_id:           data.car_id,
                service_date:     data.service_date !== undefined ? new Date(data.service_date) : undefined,
                mileage:          data.mileage,
                description:      data.description,
                service_type:     data.service_type,
                service_category: derivedCategory ?? data.service_category ?? undefined,
                cost:             data.cost,
                currency:         data.currency !== undefined ? normalizeCurrency(data.currency) : undefined,
                ...conversion,
                expiry_date:      data.expiry_date !== undefined ? (data.expiry_date ? new Date(data.expiry_date) : null) : undefined,
                // Clearing the reminder date also clears its title.
                reminder_title:   data.expiry_date !== undefined && !data.expiry_date ? null
                                    : data.reminder_title !== undefined ? (data.reminder_title?.trim() || null) : undefined,
                is_diy:           data.is_diy,
                fuel_liters:        data.fuel_liters,
                energy_kwh:         data.energy_kwh,
                is_company_expense: data.is_company_expense,
                labor_cost:         data.labor_cost,
                ...partsCostFields(data),
                notes:              data.notes,
                supplier_id:        supplierId,
                // A linked supplier wins (name stored null); null/empty clears; omitted leaves it.
                service_name:       supplierId != null ? null
                                      : data.service_name !== undefined ? (data.service_name?.trim() || null) : undefined,
                custom_items:       data.custom_items !== undefined ? sanitizeCustomItems(data.custom_items) : undefined,
                parts: data.parts !== undefined
                    ? { create: data.parts.map(p => ({ name: p.name, code: p.code, quantity: p.quantity, price: p.price, currency: p.currency ?? null })) }
                    : undefined,
                // Provided -> replaces the whole set; omitted -> untouched.
                plan_items: data.plan_items !== undefined
                    ? { deleteMany: {}, create: [...new Set(data.plan_items)].map(item => ({ item })) }
                    : undefined,
            },
            include: RECORD_INCLUDE,
        });
        await this._syncLastOilService(record.car_id);
        await this._syncActualMileage(record.car_id, record.mileage);
        return this._attachConsumptionSingle(withPlanItems(record));
    }

    async deleteMaintenanceRecord(id: number, userId: number): Promise<MaintenanceRecord> {
        const existing = await this.prisma.maintenanceRecord.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Maintenance record not found');
        await this.assertAccessOrNotFound(existing.car_id, userId);

        const record = await this.prisma.maintenanceRecord.delete({
            where: { id },
        });
        await this._syncLastOilService(record.car_id);
        return record;
    }

    /** Same access rule as the rest of this service, but Not Found instead of Forbidden — a
     * maintenance record's existence shouldn't be distinguishable from "no access" to someone
     * probing ids. */
    private async assertAccessOrNotFound(carId: number, userId: number): Promise<void> {
        try {
            await this.carAccess.assertHasAccess(carId, userId);
        } catch {
            throw new NotFoundException('Maintenance record not found');
        }
    }

    // Keeps Car.last_oil_service_mileage/date in sync with the highest-mileage
    // record linked to the ENGINE_OIL plan item, since the frontend's "next oil service" estimate is
    // derived from those car fields rather than from the records list directly.
    private async _syncLastOilService(carId: number): Promise<void> {
        // mileage is now optional on a record — exclude records without one so
        // a null doesn't sort ahead of a real, comparable mileage value.
        const latestOilChange = await this.prisma.maintenanceRecord.findFirst({
            where: { car_id: carId, plan_items: { some: { item: 'ENGINE_OIL' } }, mileage: { not: null } },
            orderBy: { mileage: 'desc' },
        });
        await this.prisma.car.update({
            where: { id: carId },
            data: {
                last_oil_service_mileage: latestOilChange?.mileage ?? null,
                last_oil_service_date:    latestOilChange?.service_date ?? null,
            },
        });
    }

    // Any maintenance record with a known mileage is evidence of the car's odometer at that
    // point in time — push Car.actual_mileage forward when it's a newer/higher reading than
    // what's on file. Deliberately one-directional (never lowers or clears it, and never runs
    // on delete) so a backdated/lower-mileage record can't fight a more recent reading entered
    // elsewhere — the record itself still keeps its own mileage exactly as entered either way.
    private async _syncActualMileage(carId: number, mileage: number | null | undefined): Promise<void> {
        if (mileage == null) return;
        const car = await this.prisma.car.findUnique({ where: { id: carId }, select: { actual_mileage: true } });
        if (car && (car.actual_mileage == null || mileage > car.actual_mileage)) {
            await this.prisma.car.update({
                where: { id: carId },
                data: { actual_mileage: mileage, actual_mileage_updated_at: new Date() },
            });
        }
    }

    /**
     * RON equivalent of a cost — same idea as document.service.ts's convertPrice. RON (or no
     * currency) is the identity; any other currency uses the BNR rate in force on the record's
     * service_date (the day the money was paid). Never throws: if no rate can be obtained the
     * cost is saved without a conversion (all four columns null).
     */
    private async convertCost(cost: number, currency: string | null, serviceDate: Date): Promise<CostConversion> {
        const code = normalizeCurrency(currency);
        if (code === 'RON') {
            return { cost_ron: cost, exchange_rate: 1, exchange_rate_date: null, exchange_rate_source: null };
        }

        const bnr = await this.exchangeRates.getRonRate(code, serviceDate).catch(() => null);
        if (!bnr) {
            this.logger.warn(`No RON exchange rate for ${code}; saving maintenance record cost without conversion`);
            return NO_CONVERSION;
        }
        return {
            cost_ron: roundMoney(cost * bnr.rate),
            exchange_rate: bnr.rate,
            exchange_rate_date: bnr.date,
            exchange_rate_source: 'BNR',
        };
    }

    /**
     * On update, the RON conversion is only touched when the cost actually changes — `cost`,
     * `currency` or `service_date` present in the payload AND different from what's stored —
     * so editing e.g. the description never re-rates an old record to today's rate. Returns
     * undefined to leave the four columns alone. Mirrors document.service.ts's
     * recomputeConversionForUpdate; maintenance has no manual exchange_rate override, so this
     * is the simpler case (cost is required, never cleared).
     */
    private async recomputeConversionForUpdate(id: number, data: UpdateMaintenanceRecordDto): Promise<CostConversion | undefined> {
        if (data.cost === undefined && data.currency === undefined && data.service_date === undefined) {
            return undefined;
        }

        const stored = await this.prisma.maintenanceRecord.findUnique({ where: { id } });
        if (!stored) return undefined; // let the update itself raise not-found

        const cost = data.cost !== undefined ? data.cost : stored.cost;
        const currency = data.currency !== undefined ? data.currency : stored.currency;
        const serviceDate = data.service_date !== undefined ? new Date(data.service_date) : stored.service_date;

        const costChanged = data.cost !== undefined && data.cost !== stored.cost;
        const currencyChanged = data.currency !== undefined && normalizeCurrency(data.currency) !== normalizeCurrency(stored.currency);
        // The BNR rate depends on the transaction date, so moving service_date re-rates a
        // BNR conversion. There's no manual override on maintenance records, so unlike
        // documents there's no "keep a MANUAL rate" case to guard here.
        const dateChanged = data.service_date !== undefined && dayKey(serviceDate) !== dayKey(stored.service_date);

        if (!costChanged && !currencyChanged && !dateChanged) return undefined;

        if (!currencyChanged && !dateChanged && stored.exchange_rate != null) {
            return {
                cost_ron: roundMoney(cost * stored.exchange_rate),
                exchange_rate: stored.exchange_rate,
                exchange_rate_date: stored.exchange_rate_date,
                exchange_rate_source: stored.exchange_rate_source,
            };
        }

        return this.convertCost(cost, currency, serviceDate);
    }

    // create/update return the bare Prisma row (no attachment/consumption enrichment, unlike the
    // list endpoints below) — compute consumption for just this one record so it's correct
    // immediately in the response, rather than only after the next full list reload.
    private async _attachConsumptionSingle(record: MaintenanceRecordWithParts): Promise<MaintenanceRecordWithParts & { consumption_l_100km?: number; consumption_kwh_100km?: number }> {
        if (record.service_type !== 'ALIMENTARE' || record.mileage == null || (record.fuel_liters == null && record.energy_kwh == null)) {
            return record;
        }
        // The just-created/updated record is already committed, so this already includes it —
        // _computeConsumption/_computeEnergyConsumption exclude self by id, so no special-casing needed here.
        const siblings = await this.prisma.maintenanceRecord.findMany({
            where: { car_id: record.car_id, service_type: 'ALIMENTARE', mileage: { not: null } },
        });
        return {
            ...record,
            consumption_l_100km: this._computeConsumption(record, siblings as MaintenanceRecordWithParts[]),
            consumption_kwh_100km: this._computeEnergyConsumption(record, siblings as MaintenanceRecordWithParts[]),
        };
    }

    async getMaintenanceRecordsByCarId(carId: number, userId: number): Promise<MaintenanceRecordWithMeta[]> {
        await this.carAccess.assertHasAccess(carId, userId);
        const records = await this.prisma.maintenanceRecord.findMany({
            where: { car_id: carId },
            include: RECORD_INCLUDE,
        });
        return this._withAttachmentMeta(records.map(withPlanItems));
    }

    async getAllByUser(userId: number): Promise<MaintenanceRecordWithMeta[]> {
        const carIds = await this.carAccess.getAccessibleCarIds(userId);
        const records = await this.prisma.maintenanceRecord.findMany({
            where: { car_id: { in: carIds } },
            include: RECORD_INCLUDE,
        });
        return this._withAttachmentMeta(records.map(withPlanItems));
    }

    // Attachments live in the generic uploaded_files table (not a Prisma
    // relation), keyed by context_type/context_id — matched by record id only,
    // deliberately not scoped to a particular uploader, so a shared car's
    // maintenance history shows the same attachment count/thumbnail to every
    // viewer regardless of who originally uploaded the file.
    private async _withAttachmentMeta(records: MaintenanceRecordWithParts[]): Promise<MaintenanceRecordWithMeta[]> {
        if (!records.length) return [];
        const files = await this.prisma.uploadedFile.findMany({
            where: { context_type: 'maintenance', context_id: { in: records.map(r => r.id) }, status: 'UPLOADED' },
            orderBy: { created_at: 'asc' },
        });

        const invoiceGroups = await this.prisma.uploadedFile.groupBy({
            by: ['context_id'],
            where: { context_type: 'maintenance_invoice', context_id: { in: records.map(r => r.id) }, status: 'UPLOADED' },
            _count: { _all: true },
        });
        const invoicesByRecord = new Map<number, number>();
        for (const g of invoiceGroups) {
            if (g.context_id != null) invoicesByRecord.set(g.context_id, g._count._all);
        }

        const filesByRecord = new Map<number, typeof files>();
        for (const file of files) {
            if (file.context_id == null) continue;
            const list = filesByRecord.get(file.context_id) ?? [];
            list.push(file);
            filesByRecord.set(file.context_id, list);
        }

        const thumbnailUrlByKey = new Map<string, string>();
        const result: MaintenanceRecordWithMeta[] = [];
        for (const record of records) {
            const recordFiles = filesByRecord.get(record.id) ?? [];
            const firstImage = recordFiles.find(f => f.mime_type.startsWith('image/'));

            let thumbnailUrl: string | null = null;
            if (firstImage) {
                thumbnailUrl = thumbnailUrlByKey.get(firstImage.file_key) ?? null;
                if (!thumbnailUrl) {
                    thumbnailUrl = await this.uploadService.createReadUrlForKey(firstImage.file_key);
                    thumbnailUrlByKey.set(firstImage.file_key, thumbnailUrl);
                }
            }

            result.push({
                ...record,
                attachmentsCount: recordFiles.length,
                invoicesCount: invoicesByRecord.get(record.id) ?? 0,
                thumbnailUrl,
                consumption_l_100km: this._computeConsumption(record, records),
                consumption_kwh_100km: this._computeEnergyConsumption(record, records),
            });
        }
        return result;
    }

    // L/100km for an ALIMENTARE fuel record, computed against the same car's previous ALIMENTARE
    // *fuel* record (highest mileage strictly below this one) — not persisted, so it's always
    // derived from the current data rather than risking drift after edits/deletes. Filters out
    // charging records (energy_kwh set, no fuel_liters) so a hybrid's charge sessions don't get
    // used as the fuel reference point, and vice versa in _computeEnergyConsumption below.
    private _computeConsumption(record: MaintenanceRecordWithParts, allRecords: MaintenanceRecordWithParts[]): number | undefined {
        if (record.service_type !== 'ALIMENTARE' || record.mileage == null || record.fuel_liters == null) return undefined;

        const previous = allRecords
            .filter(r =>
                r.id !== record.id &&
                r.car_id === record.car_id &&
                r.service_type === 'ALIMENTARE' &&
                r.fuel_liters != null &&
                r.mileage != null &&
                r.mileage < record.mileage!,
            )
            .sort((a, b) => b.mileage! - a.mileage!)[0];

        if (!previous) return undefined;
        const distance = record.mileage - previous.mileage!;
        if (distance <= 0) return undefined;

        return Math.round((record.fuel_liters / distance) * 100 * 10) / 10;
    }

    // Same idea as _computeConsumption, but for the energy_kwh side (electric/hybrid cars
    // charging instead of refueling) — kept as a separate method rather than a shared one
    // with a field-name parameter, since a record only ever has one of the two set and the
    // "previous" record for each axis must be filtered independently (a charge session's
    // consumption compares against the previous charge, never a fuel fill-up in between).
    private _computeEnergyConsumption(record: MaintenanceRecordWithParts, allRecords: MaintenanceRecordWithParts[]): number | undefined {
        if (record.service_type !== 'ALIMENTARE' || record.mileage == null || record.energy_kwh == null) return undefined;

        const previous = allRecords
            .filter(r =>
                r.id !== record.id &&
                r.car_id === record.car_id &&
                r.service_type === 'ALIMENTARE' &&
                r.energy_kwh != null &&
                r.mileage != null &&
                r.mileage < record.mileage!,
            )
            .sort((a, b) => b.mileage! - a.mileage!)[0];

        if (!previous) return undefined;
        const distance = record.mileage - previous.mileage!;
        if (distance <= 0) return undefined;

        return Math.round((record.energy_kwh / distance) * 100 * 10) / 10;
    }
}

/** parts_cost override columns: currency is always null when the amount is null; untouched when neither is sent (update). */
function partsCostFields(data: { parts_cost?: number | null; parts_cost_currency?: string | null }) {
    if (data.parts_cost === undefined && data.parts_cost_currency === undefined) return {};
    if (data.parts_cost == null) return { parts_cost: null, parts_cost_currency: null };
    return { parts_cost: data.parts_cost, parts_cost_currency: data.parts_cost_currency ?? null };
}

function normalizeCurrency(currency: string | null | undefined): string {
    return currency?.trim().toUpperCase() || 'RON';
}

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** YYYY-MM-DD of a date (or null), for comparing calendar days regardless of time. */
function dayKey(d: Date | null | undefined): string | null {
    return d ? d.toISOString().slice(0, 10) : null;
}
