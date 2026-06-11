import { CarAccessRole, MaintenanceRecord } from '@prisma/client';
import { CarDto } from '../../car/dto/car.dto';
import { DocumentDto } from '../../document/dto/document.dto';
import { SharedCarDto } from '../../car-access/dto/car-access.dto';

export class SharedCarEntry {
  car: CarDto;
  role: CarAccessRole;
}

export class BootstrapResponseDto {
  ownedCars: CarDto[];
  sharedCars: SharedCarEntry[];
  pendingInvites: SharedCarDto[];
  documents: Record<number, DocumentDto[]>;
  maintenance: Record<number, MaintenanceRecord[]>;
}
