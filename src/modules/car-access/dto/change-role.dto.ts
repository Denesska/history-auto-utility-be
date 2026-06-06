import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { CarAccessRole } from '@prisma/client';

export class ChangeRoleDto {
  @ApiProperty({ enum: CarAccessRole, example: CarAccessRole.VIEWER })
  @IsEnum(CarAccessRole)
  role: CarAccessRole;
}
