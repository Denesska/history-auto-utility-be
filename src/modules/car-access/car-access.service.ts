import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CarAccessRole, User } from '@prisma/client';
import { ROLE_RANK } from '../../common/guards/car-access/car-access.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { CarAccessDto, SharedCarDto } from './dto/car-access.dto';

@Injectable()
export class CarAccessService {
  constructor(private readonly prisma: PrismaService) {}

  // ── helpers ────────────────────────────────────────────────────────────

  private async resolveUser(googleId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { google_id: googleId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async assertOwner(carId: number, userId: number): Promise<void> {
    const car = await this.prisma.car.findUnique({ where: { id: carId } });
    if (!car) throw new NotFoundException('Car not found');
    if (car.user_id !== userId) throw new ForbiddenException('Only the owner can manage access');
  }

  private toAccessDto(entry: any): CarAccessDto {
    return {
      id: entry.id,
      car_id: entry.car_id,
      role: entry.role,
      user: {
        id: entry.user.id,
        email: entry.user.email,
        first_name: entry.user.first_name,
        last_name: entry.user.last_name,
        picture: entry.user.picture,
      },
      invited_by: {
        id: entry.invited_by.id,
        email: entry.invited_by.email,
        first_name: entry.invited_by.first_name,
        last_name: entry.invited_by.last_name,
        picture: entry.invited_by.picture,
      },
      accepted_at: entry.accepted_at,
      created_at: entry.created_at,
    };
  }

  private readonly accessInclude = {
    user: { select: { id: true, email: true, first_name: true, last_name: true, picture: true } },
    invited_by: { select: { id: true, email: true, first_name: true, last_name: true, picture: true } },
  };

  // ── invite ─────────────────────────────────────────────────────────────

  async inviteUser(carId: number, ownerGoogleId: string, dto: InviteUserDto): Promise<CarAccessDto> {
    const owner = await this.resolveUser(ownerGoogleId);
    await this.assertOwner(carId, owner.id);

    if (dto.role === CarAccessRole.OWNER) {
      throw new BadRequestException('Cannot assign OWNER role via invite');
    }

    const target = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!target) throw new NotFoundException(`No registered user with email ${dto.email}`);
    if (target.id === owner.id) throw new BadRequestException('Cannot invite yourself');

    const existing = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: target.id } },
    });
    if (existing) throw new BadRequestException('User already has access or a pending invitation');

    const entry = await this.prisma.carUserAccess.create({
      data: {
        car_id: carId,
        user_id: target.id,
        role: dto.role,
        invited_by_user_id: owner.id,
      },
      include: this.accessInclude,
    });

    return this.toAccessDto(entry);
  }

  // ── accept ─────────────────────────────────────────────────────────────

  async acceptInvitation(carId: number, inviteeGoogleId: string): Promise<CarAccessDto> {
    const user = await this.resolveUser(inviteeGoogleId);

    const entry = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: user.id } },
    });

    if (!entry) throw new NotFoundException('No invitation found for this car');
    if (entry.accepted_at) throw new BadRequestException('Invitation already accepted');

    const updated = await this.prisma.carUserAccess.update({
      where: { car_id_user_id: { car_id: carId, user_id: user.id } },
      data: { accepted_at: new Date() },
      include: this.accessInclude,
    });

    return this.toAccessDto(updated);
  }

  // ── remove ─────────────────────────────────────────────────────────────

  async removeAccess(carId: number, ownerGoogleId: string, targetUserId: number): Promise<void> {
    const owner = await this.resolveUser(ownerGoogleId);
    await this.assertOwner(carId, owner.id);

    if (targetUserId === owner.id) {
      throw new ForbiddenException('Cannot remove the owner');
    }

    const entry = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: targetUserId } },
    });
    if (!entry) throw new NotFoundException('Access record not found');

    await this.prisma.carUserAccess.delete({
      where: { car_id_user_id: { car_id: carId, user_id: targetUserId } },
    });
  }

  // ── change role ────────────────────────────────────────────────────────

  async changeRole(
    carId: number,
    ownerGoogleId: string,
    targetUserId: number,
    dto: ChangeRoleDto,
  ): Promise<CarAccessDto> {
    const owner = await this.resolveUser(ownerGoogleId);
    await this.assertOwner(carId, owner.id);

    if (dto.role === CarAccessRole.OWNER) {
      throw new BadRequestException('Cannot assign OWNER role');
    }
    if (targetUserId === owner.id) {
      throw new ForbiddenException('Cannot change owner\'s role');
    }

    const entry = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: targetUserId } },
    });
    if (!entry) throw new NotFoundException('Access record not found');

    const updated = await this.prisma.carUserAccess.update({
      where: { car_id_user_id: { car_id: carId, user_id: targetUserId } },
      data: { role: dto.role },
      include: this.accessInclude,
    });

    return this.toAccessDto(updated);
  }

  // ── list access ────────────────────────────────────────────────────────

  async getAccessList(carId: number): Promise<CarAccessDto[]> {
    const car = await this.prisma.car.findUnique({
      where: { id: carId },
      include: { user: { select: { id: true, email: true, first_name: true, last_name: true, picture: true } } },
    });
    if (!car) throw new NotFoundException('Car not found');

    const entries = await this.prisma.carUserAccess.findMany({
      where: { car_id: carId },
      include: this.accessInclude,
    });

    // Prepend a synthetic OWNER entry for the car's original owner
    const ownerEntry: CarAccessDto = {
      id: 0,
      car_id: carId,
      role: CarAccessRole.OWNER,
      user: car.user as any,
      invited_by: car.user as any,
      accepted_at: car.user['created_at'] ?? null,
      created_at: car.user['created_at'] ?? new Date(),
    };

    return [ownerEntry, ...entries.map(e => this.toAccessDto(e))];
  }

  // ── resolve role (used by other services) ─────────────────────────────

  async resolveUserRole(carId: number, googleId: string): Promise<CarAccessRole> {
    const user = await this.resolveUser(googleId);
    const car = await this.prisma.car.findUnique({ where: { id: carId } });
    if (!car) throw new NotFoundException('Car not found');
    if (car.user_id === user.id) return CarAccessRole.OWNER;

    const access = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: user.id } },
    });
    if (!access || !access.accepted_at) throw new ForbiddenException('No access to this car');
    return access.role;
  }

  // ── leave (shared user removes themselves) ─────────────────────────────

  async leaveAccess(carId: number, googleId: string): Promise<void> {
    const user = await this.resolveUser(googleId);
    const car = await this.prisma.car.findUnique({ where: { id: carId } });
    if (!car) throw new NotFoundException('Car not found');
    if (car.user_id === user.id) throw new ForbiddenException('Owner cannot leave their own car');

    const access = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: user.id } },
    });
    if (!access) throw new NotFoundException('Access record not found');

    await this.prisma.carUserAccess.delete({
      where: { car_id_user_id: { car_id: carId, user_id: user.id } },
    });
  }

  // ── shared cars ────────────────────────────────────────────────────────

  async getSharedCars(googleId: string): Promise<SharedCarDto[]> {
    const user = await this.resolveUser(googleId);

    const entries = await this.prisma.carUserAccess.findMany({
      where: { user_id: user.id },
      include: {
        car: { select: { id: true, make: true, model: true, variant: true, year: true, license_plate: true } },
      },
    });

    return entries.map(e => ({
      id: e.car.id,
      make: e.car.make,
      model: e.car.model,
      variant: e.car.variant,
      year: e.car.year,
      license_plate: e.car.license_plate,
      shared_role: e.role,
      accepted_at: e.accepted_at,
    }));
  }
}
