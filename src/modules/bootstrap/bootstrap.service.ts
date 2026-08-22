import { Injectable } from '@nestjs/common';
import { MaintenanceRecord, ServiceCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CarService } from '../car/car.service';
import { CarAccessService } from '../car-access/car-access.service';
import { DocumentService } from '../document/document.service';
import { MaintenanceRecordService } from '../maintenance-record/maintenance-record.service';
import { DEFAULT_MAINTENANCE_INTERVALS } from '../maintenance-record/maintenance-interval.defaults';
import { CarMaintenanceSettingsService } from '../car-maintenance-settings/car-maintenance-settings.service';
import { BootstrapResponseDto, SharedCarEntry } from './dto/bootstrap-response.dto';
import { DocumentDto } from '../document/dto/document.dto';
import { MaintenanceIntervalDto } from '../maintenance-record/dto/maintenance-interval.dto';

@Injectable()
export class BootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carService: CarService,
    private readonly carAccessService: CarAccessService,
    private readonly documentService: DocumentService,
    private readonly maintenanceRecordService: MaintenanceRecordService,
    private readonly carMaintenanceSettingsService: CarMaintenanceSettingsService,
  ) {}

  async getInitialData(googleId: string): Promise<BootstrapResponseDto> {
    const [me, ownedCars, sharedInvitations] = await Promise.all([
      this.prisma.user.findUnique({
        where: { google_id: googleId },
        select: { id: true, email: true, first_name: true, last_name: true, picture: true },
      }),
      this.carService.getAllCars(googleId),
      this.carAccessService.getSharedCars(googleId),
    ]);

    const accepted = sharedInvitations.filter(s => s.accepted_at !== null);
    const pendingInvites = sharedInvitations.filter(s => s.accepted_at === null);

    const [sharedCarEntries, allDocuments, allMaintenance, carMaintenanceSettings] = await Promise.all([
      Promise.all(
        accepted.map(async s => {
          const car = await this.carService.getCar(s.id);
          return car ? { car, role: s.shared_role } : null;
        }),
      ),
      this.documentService.getAllDocumentsByUser(googleId),
      this.maintenanceRecordService.getAllByUser(googleId),
      me ? this.carMaintenanceSettingsService.getAllByUser(me.id) : Promise.resolve({}),
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

    const maintenanceIntervals: MaintenanceIntervalDto[] = (Object.keys(DEFAULT_MAINTENANCE_INTERVALS) as ServiceCategory[]).map(
      category => ({ category, ...DEFAULT_MAINTENANCE_INTERVALS[category] }),
    );

    return {
      me,
      ownedCars,
      sharedCars: validSharedCars,
      pendingInvites,
      documents,
      maintenance,
      maintenanceIntervals,
      carMaintenanceSettings,
    };
  }
}
