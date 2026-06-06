import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum } from 'class-validator';
import { CarAccessRole } from '@prisma/client';

export class InviteUserDto {
  @ApiProperty({ example: 'friend@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: CarAccessRole, example: CarAccessRole.VIEWER })
  @IsEnum(CarAccessRole)
  role: CarAccessRole;
}
