import {MaintenanceRecord, ServiceCategory, ServiceType} from '@prisma/client';

export class MaintenanceRecordEntity implements MaintenanceRecord {
    id: number;
    car_id: number;
    service_date: Date;
    mileage: number | null;
    description: string;
    service_type: ServiceType;
    service_category: ServiceCategory;
    cost: number;
    expiry_date: Date;
    is_diy: boolean;
    fuel_liters: number | null;
    energy_kwh: number | null;
    is_company_expense: boolean;
}
