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
    currency: string;
    cost_ron: number | null;
    exchange_rate: number | null;
    exchange_rate_date: Date | null;
    exchange_rate_source: string | null;
    expiry_date: Date;
    is_diy: boolean;
    fuel_liters: number | null;
    energy_kwh: number | null;
    is_company_expense: boolean;
    labor_cost: number | null;
    notes: string | null;
    created_at: Date;
    supplier_id: number | null;
}
