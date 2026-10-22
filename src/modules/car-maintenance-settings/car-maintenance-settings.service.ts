import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CarMaintenanceSetting, PlanItemKey } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getPlanItemDefinitions, PlanItemCarInfo, PlanItemDefinition } from '../maintenance-record/plan-item.catalog';
import { MaintenanceSettingDto } from './dto/maintenance-setting.dto';
import { UpdateMaintenanceSettingDto } from './dto/update-maintenance-setting.dto';
import { CarAccessService } from '../car-access/car-access.service';

const CAR_INFO_SELECT = { fuel_type: true, transmission: true, drivetrain: true, engine_oil_viscosity: true } as const;

@Injectable()
export class CarMaintenanceSettingsService {
  constructor(private readonly prisma: PrismaService, private readonly carAccess: CarAccessService) {}

  /** Every item that applies to the car, with the user's overrides for this profile resolved against the catalog. */
  async getSettings(carId: number, userId: number, profileId: number): Promise<MaintenanceSettingDto[]> {
    await this.assertCanSeeCar(carId, userId);
    await this.assertCanSeeProfile(carId, userId, profileId);

    const car = await this.getCarInfo(carId);
    const rows = await this.prisma.carMaintenanceSetting.findMany({ where: { car_id: carId, user_id: userId, profile_id: profileId } });
    return this.mergeWithDefaults(profileId, car, rows);
  }

  async setSetting(
    carId: number,
    userId: number,
    profileId: number,
    item: PlanItemKey,
    dto: UpdateMaintenanceSettingDto,
  ): Promise<MaintenanceSettingDto> {
    await this.assertCanSeeCar(carId, userId);
    await this.assertCanSeeProfile(carId, userId, profileId);

    const car = await this.getCarInfo(carId);
    const def = this.definitionFor(car, item);

    const existing = await this.prisma.carMaintenanceSetting.findUnique({
      where: { car_id_user_id_profile_id_item: { car_id: carId, user_id: userId, profile_id: profileId, item } },
    });

    const defaultTracked = def?.trackedByDefault ?? true;
    const tracked = dto.tracked ?? existing?.tracked ?? defaultTracked;
    const customKm = dto.custom_interval_km !== undefined ? dto.custom_interval_km : existing?.custom_interval_km ?? null;
    const customMonths = dto.custom_interval_months !== undefined ? dto.custom_interval_months : existing?.custom_interval_months ?? null;
    const customOilChanges = dto.custom_interval_oil_changes !== undefined ? dto.custom_interval_oil_changes : existing?.custom_interval_oil_changes ?? null;

    // Neutral state (the car's catalog default, nothing overridden) doesn't need a row at
    // all — delete it rather than storing a no-op, so a reset leaves no stale state behind.
    const isNeutral = tracked === defaultTracked && customKm === null && customMonths === null && customOilChanges === null;

    let row: CarMaintenanceSetting | null;
    if (isNeutral) {
      if (existing) await this.prisma.carMaintenanceSetting.delete({ where: { id: existing.id } });
      row = null;
    } else {
      const values = { tracked, custom_interval_km: customKm, custom_interval_months: customMonths, custom_interval_oil_changes: customOilChanges };
      row = await this.prisma.carMaintenanceSetting.upsert({
        where: { car_id_user_id_profile_id_item: { car_id: carId, user_id: userId, profile_id: profileId, item } },
        create: { car_id: carId, user_id: userId, profile_id: profileId, item, ...values },
        update: values,
      });
    }

    return this.toDto(profileId, item, def, row);
  }

  /** Sparse — only the items actually overridden, across every car/profile the user can see. Used by bootstrap. */
  async getAllByUser(userId: number): Promise<Record<number, MaintenanceSettingDto[]>> {
    const carIds = await this.carAccess.getAccessibleCarIds(userId);
    const rows = await this.prisma.carMaintenanceSetting.findMany({
      where: { user_id: userId, car_id: { in: carIds } },
    });
    if (!rows.length) return {};

    const cars = await this.prisma.car.findMany({
      where: { id: { in: [...new Set(rows.map(r => r.car_id))] } },
      select: { id: true, ...CAR_INFO_SELECT },
    });
    const carById = new Map(cars.map(c => [c.id, c]));

    const result: Record<number, MaintenanceSettingDto[]> = {};
    rows.forEach(r => {
      const car = carById.get(r.car_id);
      if (!car) return;
      (result[r.car_id] ??= []).push(this.toDto(r.profile_id, r.item, this.definitionFor(car, r.item), r));
    });
    return result;
  }

  private mergeWithDefaults(profileId: number, car: PlanItemCarInfo, rows: CarMaintenanceSetting[]): MaintenanceSettingDto[] {
    const byItem = new Map(rows.map(r => [r.item, r]));
    return getPlanItemDefinitions(car).map(def => this.toDto(profileId, def.key, def, byItem.get(def.key) ?? null));
  }

  /** `def` is undefined when the item doesn't apply to the car (stale override) — falls back to "no default interval". */
  private toDto(profileId: number, item: PlanItemKey, def: PlanItemDefinition | undefined, row: CarMaintenanceSetting | null): MaintenanceSettingDto {
    return {
      profile_id: profileId,
      item,
      tracked: row?.tracked ?? def?.trackedByDefault ?? true,
      interval_km: row?.custom_interval_km ?? def?.km ?? null,
      interval_months: row?.custom_interval_months ?? def?.months ?? null,
      interval_oil_changes: row?.custom_interval_oil_changes ?? def?.oilChanges ?? null,
      is_custom_km: row?.custom_interval_km != null,
      is_custom_months: row?.custom_interval_months != null,
      is_custom_oil_changes: row?.custom_interval_oil_changes != null,
    };
  }

  private definitionFor(car: PlanItemCarInfo, item: PlanItemKey): PlanItemDefinition | undefined {
    return getPlanItemDefinitions(car).find(d => d.key === item);
  }

  private async getCarInfo(carId: number): Promise<PlanItemCarInfo> {
    const car = await this.prisma.car.findUnique({ where: { id: carId }, select: CAR_INFO_SELECT });
    if (!car) throw new NotFoundException('Car not found');
    return car;
  }

  /**
   * The settings are per user, so any level of access is enough to have them — but a
   * user with no access to the car must not be able to probe which cars exist.
   */
  private async assertCanSeeCar(carId: number, userId: number): Promise<void> {
    await this.carAccess.assertHasAccess(carId, userId);
  }

  /** A profile is per (car, user) — must belong to this exact pair, regardless of car access level. */
  private async assertCanSeeProfile(carId: number, userId: number, profileId: number): Promise<void> {
    const profile = await this.prisma.maintenanceProfile.findUnique({
      where: { id: profileId },
      select: { car_id: true, user_id: true },
    });
    if (!profile || profile.car_id !== carId || profile.user_id !== userId) {
      throw new NotFoundException('Maintenance profile not found');
    }
  }
}
