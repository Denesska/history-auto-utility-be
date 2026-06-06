import { SetMetadata } from '@nestjs/common';
import { CarAccessRole } from '@prisma/client';

export const REQUIRED_CAR_ROLE_KEY = 'requiredCarRole';
export const RequiredCarRole = (role: CarAccessRole) =>
  SetMetadata(REQUIRED_CAR_ROLE_KEY, role);
