import { Injectable } from '@nestjs/common';
import { MaintenanceRecord } from '@prisma/client';
import { CarService } from '../car/car.service';
import { CarAccessService } from '../car-access/car-access.service';
import { DocumentService } from '../document/document.service';
import { MaintenanceRecordService } from '../maintenance-record/maintenance-record.service';
import { BootstrapResponseDto, SharedCarEntry } from './dto/bootstrap-response.dto';
import { DocumentDto } from '../document/dto/document.dto';

@Injectable()
export class BootstrapService {
  constructor(
    private readonly carService: CarService,
    private readonly carAccessService: CarAccessService,
    private readonly documentService: DocumentService,
    private readonly maintenanceRecordService: MaintenanceRecordService,
  ) {}

  async getInitialData(googleId: string): Promise<BootstrapResponseDto> {
    const [ownedCars, sharedInvitations] = await Promise.all([
      this.carService.getAllCars(googleId),
      this.carAccessService.getSharedCars(googleId),
    ]);

    const accepted = sharedInvitations.filter(s => s.accepted_at !== null);
    const pendingInvites = sharedInvitations.filter(s => s.accepted_at === null);

    const [sharedCarEntries, allDocuments, allMaintenance] = await Promise.all([
      Promise.all(
        accepted.map(async s => {
          const car = await this.carService.getCar(s.id);
          return car ? { car, role: s.shared_role } : null;
        }),
      ),
      this.documentService.getAllDocumentsByUser(googleId),
      this.maintenanceRecordService.getAllByUser(googleId),
    ]);

    const validSharedCars: SharedCarEntry[] = (sharedCarEntries as (SharedCarEntry | null)[]).filter(
      (e): e is SharedCarEntry => e !== null,
    );

    const documents: Record<number, DocumentDto[]> = {};
    allDocuments.forEach(d => {
      if (!documents[d.car_id]) documents[d.car_id] = [];
      documents[d.car_id].push(d);
    });

    const maintenance: Record<number, MaintenanceRecord[]> = {};
    allMaintenance.forEach(m => {
      if (!maintenance[m.car_id]) maintenance[m.car_id] = [];
      maintenance[m.car_id].push(m);
    });

    return { ownedCars, sharedCars: validSharedCars, pendingInvites, documents, maintenance };
  }
}
