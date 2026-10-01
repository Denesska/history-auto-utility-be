import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationRole } from '@prisma/client';

export class OrganizationMemberUserDto {
  @ApiProperty() id: number;
  @ApiProperty() email: string;
  @ApiProperty() first_name: string;
  @ApiProperty() last_name: string;
  @ApiPropertyOptional() picture?: string;
}

export class OrganizationMembershipDto {
  @ApiProperty() id: number;
  @ApiProperty() organization_id: number;
  @ApiProperty({ enum: OrganizationRole }) role: OrganizationRole;
  @ApiProperty({ type: OrganizationMemberUserDto }) user: OrganizationMemberUserDto;
  @ApiProperty({ type: OrganizationMemberUserDto }) invited_by: OrganizationMemberUserDto;
  @ApiPropertyOptional() accepted_at: Date | null;
  @ApiProperty() created_at: Date;
}

/** One organization as listed for "my organizations" — includes the caller's own role in it. */
export class MyOrganizationDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiProperty({ enum: OrganizationRole }) role: OrganizationRole;
  @ApiPropertyOptional() accepted_at: Date | null;
}
