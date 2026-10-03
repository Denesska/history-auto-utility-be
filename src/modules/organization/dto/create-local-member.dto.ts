import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { OrganizationRole } from '@prisma/client';
import { USERNAME_REGEX } from '../../../common/util/username.util';

/** Creates a brand-new, company-owned account (no Google sign-in) — see OrganizationService.createLocalMember. */
export class CreateLocalMemberDto {
  @ApiProperty({ example: 'Ion' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @ApiProperty({ example: 'Popescu' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName: string;

  /** Optional short login name (lowercase letters/digits, 3-20, globally unique). Omitted -> generated from the names (see username.util). */
  @ApiPropertyOptional({ example: 'popesio' })
  @IsOptional()
  @IsString()
  @Matches(USERNAME_REGEX, { message: 'Username must be 3-20 lowercase letters or digits' })
  username?: string;

  @ApiProperty({ enum: OrganizationRole, example: OrganizationRole.DRIVER })
  @IsEnum(OrganizationRole)
  role: OrganizationRole;
}
