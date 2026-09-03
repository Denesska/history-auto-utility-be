import { Injectable } from '@nestjs/common';
import { MaintenanceRecord, MaintenancePart, ServiceCategory } from '@prisma/client';
import {PrismaService} from "../../prisma/prisma.service";
import {CreateMaintenanceRecordDto} from "./dto/create-maintenance-record.dto";
import {UpdateMaintenanceRecordDto} from "./dto/update-maintenance-record.dto";
import { UploadService } from '../upload/upload.service';

export type MaintenanceRecordWithParts = MaintenanceRecord & { parts: MaintenancePart[] };
export type MaintenanceRecordWithMeta = MaintenanceRecordWithParts & { attachmentsCount: number; thumbnailUrl: string | null };

@Injectable()
export class MaintenanceRecordService {
    constructor(
        private prisma: PrismaService,
        private uploadService: UploadService,
    ) {}

    async createMaintenanceRecord(data: CreateMaintenanceRecordDto): Promise<MaintenanceRecordWithParts> {
        const record = await this.prisma.maintenanceRecord.create({
            data: {
                car_id:           data.car_id,
                service_date:     new Date(data.service_date),
                mileage:          data.mileage,
                description:      data.description,
                service_type:     data.service_type,
                service_category: data.service_category ?? ServiceCategory.OTHER,
                cost:             data.cost,
                expiry_date:      data.expiry_date ? new Date(data.expiry_date) : null,
                is_diy:           data.is_diy ?? false,
                parts: data.parts?.length
                    ? { create: data.parts.map(p => ({ name: p.name, code: p.code, quantity: p.quantity, price: p.price })) }
                    : undefined,
            },
            include: { parts: true },
        });
        await this._syncLastOilService(record.car_id);
        return record;
    }

    async getMaintenanceRecord(id: number): Promise<MaintenanceRecordWithParts | null> {
        return this.prisma.maintenanceRecord.findUnique({
            where: { id },
            include: { parts: true },
        });
    }

    async updateMaintenanceRecord(id: number, data: UpdateMaintenanceRecordDto): Promise<MaintenanceRecordWithParts> {
        // Parts have no stable client-side id to diff against, so an edit replaces
        // the whole set rather than trying to patch individual rows.
        if (data.parts !== undefined) {
            await this.prisma.maintenancePart.deleteMany({ where: { maintenance_record_id: id } });
        }
        const record = await this.prisma.maintenanceRecord.update({
            where: { id },
            data: {
                car_id:           data.car_id,
                service_date:     data.service_date !== undefined ? new Date(data.service_date) : undefined,
                mileage:          data.mileage,
                description:      data.description,
                service_type:     data.service_type,
                service_category: data.service_category,
                cost:             data.cost,
                expiry_date:      data.expiry_date !== undefined ? (data.expiry_date ? new Date(data.expiry_date) : null) : undefined,
                is_diy:           data.is_diy,
                parts: data.parts !== undefined
                    ? { create: data.parts.map(p => ({ name: p.name, code: p.code, quantity: p.quantity, price: p.price })) }
                    : undefined,
            },
            include: { parts: true },
        });
        await this._syncLastOilService(record.car_id);
        return record;
    }

    async deleteMaintenanceRecord(id: number): Promise<MaintenanceRecord> {
        const record = await this.prisma.maintenanceRecord.delete({
            where: { id },
        });
        await this._syncLastOilService(record.car_id);
        return record;
    }

    // Keeps Car.last_oil_service_mileage/date in sync with the highest-mileage
    // OIL_CHANGE record, since the frontend's "next oil service" estimate is
    // derived from those car fields rather than from the records list directly.
    private async _syncLastOilService(carId: number): Promise<void> {
        // mileage is now optional on a record — exclude records without one so
        // a null doesn't sort ahead of a real, comparable mileage value.
        const latestOilChange = await this.prisma.maintenanceRecord.findFirst({
            where: { car_id: carId, service_category: 'OIL_CHANGE', mileage: { not: null } },
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

    async getMaintenanceRecordsByCarId(carId: number): Promise<MaintenanceRecordWithMeta[]> {
        const records = await this.prisma.maintenanceRecord.findMany({
            where: { car_id: carId },
            include: { parts: true },
        });
        return this._withAttachmentMeta(records);
    }

    async getAllByUser(googleId: string): Promise<MaintenanceRecordWithMeta[]> {
        const records = await this.prisma.maintenanceRecord.findMany({
            where: {
                OR: [
                    { car: { user: { google_id: googleId } } },
                    { car: { access_entries: { some: { user: { google_id: googleId }, accepted_at: { not: null } } } } },
                ],
            },
            include: { parts: true },
        });
        return this._withAttachmentMeta(records);
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

            result.push({ ...record, attachmentsCount: recordFiles.length, thumbnailUrl });
        }
        return result;
    }
}
