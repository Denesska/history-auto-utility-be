import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MaintenanceProfile } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MaintenanceProfileDto } from './dto/maintenance-profile.dto';

@Injectable()
export class CarMaintenanceProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfiles(carId: number, userId: number): Promise<MaintenanceProfileDto[]> {
    await this.assertCanSeeCar(carId, userId);
    const rows = await this.prisma.maintenanceProfile.findMany({
      where: { car_id: carId, user_id: userId },
      orderBy: { created_at: 'asc' },
    });
    return rows.map(r => this.toDto(r));
  }

  async createProfile(carId: number, userId: number, name: string): Promise<MaintenanceProfileDto> {
    await this.assertCanSeeCar(carId, userId);
    try {
      const row = await this.prisma.maintenanceProfile.create({ data: { car_id: carId, user_id: userId, name } });
      return this.toDto(row);
    } catch (e) {
      if (e?.code === 'P2002') {
        throw new ConflictException({ code: 'MAINTENANCE_PROFILE_NAME_CONFLICT', message: 'A profile with this name already exists for this car' });
      }
      throw e;
    }
  }

  async renameProfile(carId: number, userId: number, profileId: number, name: string): Promise<MaintenanceProfileDto> {
    await this.assertOwnsProfile(carId, userId, profileId);
    try {
      const row = await this.prisma.maintenanceProfile.update({ where: { id: profileId }, data: { name } });
      return this.toDto(row);
    } catch (e) {
      if (e?.code === 'P2002') {
        throw new ConflictException({ code: 'MAINTENANCE_PROFILE_NAME_CONFLICT', message: 'A profile with this name already exists for this car' });
      }
      throw e;
    }
  }

  async deleteProfile(carId: number, userId: number, profileId: number): Promise<void> {
    await this.assertOwnsProfile(carId, userId, profileId);
    // Cascades the profile's CarMaintenanceSetting rows (onDelete: Cascade in schema).
    await this.prisma.maintenanceProfile.delete({ where: { id: profileId } });
  }

  /** Every profile the user has across every car they own or have accepted access to. Used by bootstrap. */
  async getAllByUser(userId: number): Promise<Record<number, MaintenanceProfileDto[]>> {
    const rows = await this.prisma.maintenanceProfile.findMany({
      where: {
        user_id: userId,
        OR: [
          { car: { user_id: userId } },
          { car: { access_entries: { some: { user_id: userId, accepted_at: { not: null } } } } },
        ],
      },
      orderBy: { created_at: 'asc' },
    });

    const result: Record<number, MaintenanceProfileDto[]> = {};
    rows.forEach(r => {
      if (!result[r.car_id]) result[r.car_id] = [];
      result[r.car_id].push(this.toDto(r));
    });
    return result;
  }

  private toDto(row: MaintenanceProfile): MaintenanceProfileDto {
    return { id: row.id, name: row.name, created_at: row.created_at };
  }

  /**
   * The settings are per user, so any level of access is enough to have them — but a
   * user with no access to the car must not be able to probe which cars exist.
   */
  private async assertCanSeeCar(carId: number, userId: number): Promise<void> {
    const car = await this.prisma.car.findUnique({ where: { id: carId }, select: { user_id: true } });
    if (!car) throw new NotFoundException('Car not found');
    if (car.user_id === userId) return;

    const access = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: userId } },
      select: { accepted_at: true },
    });
    if (!access?.accepted_at) throw new ForbiddenException('No access to this car');
  }

  /** A profile is per (car, user) — must belong to this exact pair to rename/delete it. */
  private async assertOwnsProfile(carId: number, userId: number, profileId: number): Promise<void> {
    const profile = await this.prisma.maintenanceProfile.findUnique({ where: { id: profileId }, select: { car_id: true, user_id: true } });
    if (!profile || profile.car_id !== carId || profile.user_id !== userId) {
      throw new NotFoundException('Maintenance profile not found');
    }
  }
}
