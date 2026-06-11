import { Injectable } from '@nestjs/common';
import { MaintenanceRecord, Prisma } from '@prisma/client';
import {PrismaService} from "../../prisma/prisma.service";
import {CreateMaintenanceRecordDto} from "./dto/create-maintenance-record.dto";

@Injectable()
export class MaintenanceRecordService {
    constructor(private prisma: PrismaService) {}

    async createMaintenanceRecord(data: CreateMaintenanceRecordDto): Promise<MaintenanceRecord> {
        return this.prisma.maintenanceRecord.create({
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
    }

    async getMaintenanceRecord(id: number): Promise<MaintenanceRecord | null> {
        return this.prisma.maintenanceRecord.findUnique({
            where: { id },
        });
    }

    async updateMaintenanceRecord(id: number, data: Prisma.MaintenanceRecordUpdateInput): Promise<MaintenanceRecord> {
        return this.prisma.maintenanceRecord.update({
            where: { id },
            data,
        });
    }

    async deleteMaintenanceRecord(id: number): Promise<MaintenanceRecord> {
        return this.prisma.maintenanceRecord.delete({
            where: { id },
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
