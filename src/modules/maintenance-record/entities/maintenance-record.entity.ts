import {MaintenanceRecord, ServiceCategory, ServiceType} from '@prisma/client';

export class MaintenanceRecordEntity implements MaintenanceRecord {
    id: number;
    car_id: number;
    service_date: Date;
    mileage: number;
    description: string;
    service_type: ServiceType;
    service_category: ServiceCategory;
    cost: number;
    expiry_date: Date;
}
