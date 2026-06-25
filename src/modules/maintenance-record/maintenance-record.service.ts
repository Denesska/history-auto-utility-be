import { Injectable } from '@nestjs/common';
import { MaintenanceRecord } from '@prisma/client';
import {PrismaService} from "../../prisma/prisma.service";
import {CreateMaintenanceRecordDto} from "./dto/create-maintenance-record.dto";
import {UpdateMaintenanceRecordDto} from "./dto/update-maintenance-record.dto";

@Injectable()
export class MaintenanceRecordService {
    constructor(private prisma: PrismaService) {}

    async createMaintenanceRecord(data: CreateMaintenanceRecordDto): Promise<MaintenanceRecord> {
        const record = await this.prisma.maintenanceRecord.create({
            data: {
                car_id:           data.car_id,
                service_date:     new Date(data.service_date),
                mileage:          data.mileage,
                description:      data.description,
                service_type:     data.service_type,
                service_category: data.service_category,
                cost:             data.cost,
                expiry_date:      data.expiry_date ? new Date(data.expiry_date) : null,
            },
        });
        await this._syncLastOilService(record.car_id);
        return record;
    }

    async getMaintenanceRecord(id: number): Promise<MaintenanceRecord | null> {
        return this.prisma.maintenanceRecord.findUnique({
            where: { id },
        });
    }

    async updateMaintenanceRecord(id: number, data: UpdateMaintenanceRecordDto): Promise<MaintenanceRecord> {
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
            },
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
        const latestOilChange = await this.prisma.maintenanceRecord.findFirst({
            where: { car_id: carId, service_category: 'OIL_CHANGE' },
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

    async getMaintenanceRecordsByCarId(carId: number): Promise<MaintenanceRecord[]> {
        return this.prisma.maintenanceRecord.findMany({
            where: { car_id: carId },
        });
    }

    async getAllByUser(googleId: string): Promise<MaintenanceRecord[]> {
        return this.prisma.maintenanceRecord.findMany({
            where: {
                OR: [
                    { car: { user: { google_id: googleId } } },
                    { car: { access_entries: { some: { user: { google_id: googleId }, accepted_at: { not: null } } } } },
                ],
            },
        });
    }
}
