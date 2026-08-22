import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CarMaintenanceSetting, ServiceCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_MAINTENANCE_INTERVALS } from '../maintenance-record/maintenance-interval.defaults';
import { MaintenanceSettingDto } from './dto/maintenance-setting.dto';
import { UpdateMaintenanceSettingDto } from './dto/update-maintenance-setting.dto';

@Injectable()
export class CarMaintenanceSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(carId: number, userId: number): Promise<MaintenanceSettingDto[]> {
    await this.assertCanSeeCar(carId, userId);

    const rows = await this.prisma.carMaintenanceSetting.findMany({ where: { car_id: carId, user_id: userId } });
    return this.mergeWithDefaults(rows);
  }

  async setSetting(
    carId: number,
    userId: number,
    category: ServiceCategory,
    dto: UpdateMaintenanceSettingDto,
  ): Promise<MaintenanceSettingDto> {
    await this.assertCanSeeCar(carId, userId);

    const existing = await this.prisma.carMaintenanceSetting.findUnique({
      where: { car_id_user_id_category: { car_id: carId, user_id: userId, category } },
    });

    const tracked = dto.tracked ?? existing?.tracked ?? true;
    const customKm = dto.custom_interval_km !== undefined ? dto.custom_interval_km : existing?.custom_interval_km ?? null;
    const customMonths = dto.custom_interval_months !== undefined ? dto.custom_interval_months : existing?.custom_interval_months ?? null;

    // Neutral state (nothing overridden) doesn't need a row at all — delete it
    // rather than storing a no-op, so a reset leaves no stale state behind.
    const isNeutral = tracked === true && customKm === null && customMonths === null;

    let row: CarMaintenanceSetting | null;
    if (isNeutral) {
      if (existing) await this.prisma.carMaintenanceSetting.delete({ where: { id: existing.id } });
      row = null;
    } else {
      row = await this.prisma.carMaintenanceSetting.upsert({
        where: { car_id_user_id_category: { car_id: carId, user_id: userId, category } },
        create: { car_id: carId, user_id: userId, category, tracked, custom_interval_km: customKm, custom_interval_months: customMonths },
        update: { tracked, custom_interval_km: customKm, custom_interval_months: customMonths },
      });
    }

    return this.toDto(category, row);
  }

  async getAllByUser(userId: number): Promise<Record<number, MaintenanceSettingDto[]>> {
    const rows = await this.prisma.carMaintenanceSetting.findMany({
      where: {
        OR: [
          { car: { user_id: userId } },
          { car: { access_entries: { some: { user_id: userId, accepted_at: { not: null } } } } },
        ],
        user_id: userId,
      },
    });

    const byCarId: Record<number, CarMaintenanceSetting[]> = {};
    rows.forEach(r => {
      if (!byCarId[r.car_id]) byCarId[r.car_id] = [];
      byCarId[r.car_id].push(r);
    });

    const result: Record<number, MaintenanceSettingDto[]> = {};
    Object.entries(byCarId).forEach(([carId, carRows]) => {
      result[Number(carId)] = carRows.map(r => this.toDto(r.category, r));
    });
    return result;
  }

  private mergeWithDefaults(rows: CarMaintenanceSetting[]): MaintenanceSettingDto[] {
    const byCategory = new Map(rows.map(r => [r.category, r]));
    return (Object.keys(DEFAULT_MAINTENANCE_INTERVALS) as ServiceCategory[]).map(category =>
      this.toDto(category, byCategory.get(category) ?? null),
    );
  }

  private toDto(category: ServiceCategory, row: CarMaintenanceSetting | null): MaintenanceSettingDto {
    const def = DEFAULT_MAINTENANCE_INTERVALS[category];
    return {
      category,
      tracked: row?.tracked ?? true,
      interval_km: row?.custom_interval_km ?? def.interval_km,
      interval_months: row?.custom_interval_months ?? def.interval_months,
      is_custom_km: row?.custom_interval_km != null,
      is_custom_months: row?.custom_interval_months != null,
    };
  }

  /**
   * The settings are per user, so any level of access is enough to have them — but a
   * user with no access to the car must not be able to probe which cars exist.
   */
  private async assertCanSeeCar(carId: number, userId: number): Promise<void> {
    const car = await this.prisma.car.findUnique({
      where: { id: carId },
      select: { user_id: true },
    });
    if (!car) throw new NotFoundException('Car not found');
    if (car.user_id === userId) return;

    const access = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: userId } },
      select: { accepted_at: true },
    });
    if (!access?.accepted_at) throw new ForbiddenException('No access to this car');
  }
}
