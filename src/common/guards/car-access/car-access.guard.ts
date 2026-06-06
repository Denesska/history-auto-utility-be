import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CarAccessRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { REQUIRED_CAR_ROLE_KEY } from '../../decorators/required-car-role.decorator';

export const ROLE_RANK: Record<CarAccessRole, number> = {
  [CarAccessRole.VIEWER]: 0,
  [CarAccessRole.MAINTENANCE]: 1,
  [CarAccessRole.USER]: 2,
  [CarAccessRole.FULL]: 3,
  [CarAccessRole.OWNER]: 4,
};

@Injectable()
export class CarAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.getAllAndOverride<CarAccessRole>(
      REQUIRED_CAR_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no role is required, allow access (guard is opt-in)
    if (!requiredRole) return true;

    const request = context.switchToHttp().getRequest();
    const googleId: string = request.user?.google_id;
    const carId = Number(request.params?.carId);

    if (!googleId || isNaN(carId)) {
      throw new ForbiddenException('Missing user or car context');
    }

    const user = await this.prisma.user.findUnique({ where: { google_id: googleId } });
    if (!user) throw new ForbiddenException('User not found');

    const car = await this.prisma.car.findUnique({ where: { id: carId } });
    if (!car) throw new NotFoundException('Car not found');

    // Car owner always has full access regardless of CarUserAccess table
    if (car.user_id === user.id) return true;

    const access = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: user.id } },
    });

    if (!access || !access.accepted_at) {
      throw new ForbiddenException('No accepted access to this car');
    }

    if (ROLE_RANK[access.role] < ROLE_RANK[requiredRole]) {
      throw new ForbiddenException(
        `Requires ${requiredRole} role, current role is ${access.role}`,
      );
    }

    return true;
  }
}
