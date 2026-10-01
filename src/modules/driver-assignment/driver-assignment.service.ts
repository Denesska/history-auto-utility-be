import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CarAccessRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CarAccessService } from '../car-access/car-access.service';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { DriverAssignmentDto } from './dto/driver-assignment.dto';

const userSelect = { id: true, email: true, first_name: true, last_name: true, picture: true };

@Injectable()
export class DriverAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carAccess: CarAccessService,
  ) {}

  /**
   * Only OWNER/FULL may assign or unassign a driver — a DRIVER's own
   * resolved role is MAINTENANCE (see `CarAccessService.resolveUserRoleById`),
   * so this also stops a driver from reassigning or dropping their own
   * assignment, not just gating on "has some access".
   */
  private async assertCanManage(carId: number, userId: number): Promise<void> {
    const role = await this.carAccess.resolveUserRoleById(carId, userId);
    if (role !== CarAccessRole.OWNER && role !== CarAccessRole.FULL) {
      throw new ForbiddenException('Only a fleet admin can manage driver assignments for this car');
    }
  }

  private async getOrgCarOrThrow(carId: number) {
    const car = await this.prisma.car.findUnique({ where: { id: carId } });
    if (!car) throw new NotFoundException('Car not found');
    if (car.organization_id == null) {
      throw new BadRequestException('Driver assignment only applies to organization-owned cars');
    }
    return car;
  }

  async assignDriver(carId: number, dto: AssignDriverDto, actingUserId: number): Promise<DriverAssignmentDto> {
    const car = await this.getOrgCarOrThrow(carId);
    await this.assertCanManage(carId, actingUserId);

    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organization_id_user_id: { organization_id: car.organization_id!, user_id: dto.driver_user_id } },
    });
    if (!membership?.accepted_at) {
      throw new BadRequestException('The driver must be an accepted member of this car\'s organization');
    }

    const created = await this.prisma.$transaction(async tx => {
      await tx.carDriverAssignment.updateMany({
        where: { car_id: carId, ended_at: null },
        data: { ended_at: new Date() },
      });
      return tx.carDriverAssignment.create({
        data: {
          car_id: carId,
          driver_user_id: dto.driver_user_id,
          assigned_by_user_id: actingUserId,
          notes: dto.notes ?? null,
        },
        include: { driver: { select: userSelect }, assigned_by: { select: userSelect } },
      });
    });

    return this.toDto(created);
  }

  async unassignDriver(carId: number, actingUserId: number): Promise<void> {
    await this.getOrgCarOrThrow(carId);
    await this.assertCanManage(carId, actingUserId);

    const current = await this.prisma.carDriverAssignment.findFirst({ where: { car_id: carId, ended_at: null } });
    if (!current) throw new NotFoundException('This car has no current driver');

    await this.prisma.carDriverAssignment.update({
      where: { id: current.id },
      data: { ended_at: new Date() },
    });
  }

  async getCurrent(carId: number, userId: number): Promise<DriverAssignmentDto | null> {
    await this.carAccess.assertHasAccess(carId, userId);
    const current = await this.prisma.carDriverAssignment.findFirst({
      where: { car_id: carId, ended_at: null },
      include: { driver: { select: userSelect }, assigned_by: { select: userSelect } },
    });
    return current ? this.toDto(current) : null;
  }

  async getHistory(carId: number, userId: number): Promise<DriverAssignmentDto[]> {
    await this.carAccess.assertHasAccess(carId, userId);
    const entries = await this.prisma.carDriverAssignment.findMany({
      where: { car_id: carId },
      include: { driver: { select: userSelect }, assigned_by: { select: userSelect } },
      orderBy: { started_at: 'desc' },
    });
    return entries.map(e => this.toDto(e));
  }

  private toDto(entry: any): DriverAssignmentDto {
    return {
      id: entry.id,
      car_id: entry.car_id,
      driver: entry.driver,
      assigned_by: entry.assigned_by,
      started_at: entry.started_at,
      ended_at: entry.ended_at,
      notes: entry.notes,
    };
  }
}
