import { CarAccessRole, MaintenanceRecord } from '@prisma/client';
import { CarDto } from '../../car/dto/car.dto';
import { DocumentDto } from '../../document/dto/document.dto';
import { CarAccessUserDto, SharedCarDto } from '../../car-access/dto/car-access.dto';
import { MaintenanceIntervalDto } from '../../maintenance-record/dto/maintenance-interval.dto';
import { MaintenanceSettingDto } from '../../car-maintenance-settings/dto/maintenance-setting.dto';

export class SharedCarEntry {
  car: CarDto;
  role: CarAccessRole;
}

export class BootstrapResponseDto {
  me: CarAccessUserDto;
  ownedCars: CarDto[];
  sharedCars: SharedCarEntry[];
  pendingInvites: SharedCarDto[];
  documents: Record<number, DocumentDto[]>;
  maintenance: Record<number, MaintenanceRecord[]>;
  maintenanceIntervals: MaintenanceIntervalDto[];
  carMaintenanceSettings: Record<number, MaintenanceSettingDto[]>;
}
