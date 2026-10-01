import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum } from 'class-validator';
import { OrganizationRole } from '@prisma/client';

export class InviteMemberDto {
  @ApiProperty({ example: 'driver@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: OrganizationRole, example: OrganizationRole.DRIVER })
  @IsEnum(OrganizationRole)
  role: OrganizationRole;
}
