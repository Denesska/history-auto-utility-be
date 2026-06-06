import { Car, CarStatus, FuelType, TransmissionType } from '@prisma/client';

export class CarEntity implements Car {
  id: number;
  user_id: number;
  vin: string | null;
  nickname: string | null;
  make: string;
  model: string;
  variant: string | null;
  year: number;
  license_plate: string;
  fuel_type: FuelType | null;
  transmission: TransmissionType | null;
  engine: string | null;
  color: string | null;
  current_mileage: number | null;
  ownership_start_date: Date | null;
  rca_expiry_date: Date | null;
  itp_expiry_date: Date | null;
  rov_expiry_date: Date | null;
  last_oil_service_date: Date | null;
  last_oil_service_mileage: number | null;
  status: CarStatus;
  sold_at: Date | null;
}
