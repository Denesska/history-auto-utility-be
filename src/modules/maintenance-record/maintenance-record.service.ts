import { Injectable } from '@nestjs/common';
import { MaintenanceRecord, Prisma } from '@prisma/client';
import {PrismaService} from "../../prisma/prisma.service";
import {CreateMaintenanceRecordDto} from "./dto/create-maintenance-record.dto";

@Injectable()
export class MaintenanceRecordService {
    constructor(private prisma: PrismaService) {}

    async createMaintenanceRecord(data: CreateMaintenanceRecordDto): Promise<MaintenanceRecord> {
        return this.prisma.maintenanceRecord.create({
            data,
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
}
