import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OrganizationRole } from '@prisma/client';

export class ChangeMemberRoleDto {
  @ApiProperty({ enum: OrganizationRole, example: OrganizationRole.FLEET_ADMIN })
  @IsEnum(OrganizationRole)
  role: OrganizationRole;
}
