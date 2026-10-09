import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Minimal identity shown to the admin reviewing/having reviewed a request. */
export class BusinessAccessRequestUserDto {
  @ApiProperty() id: number;
  @ApiProperty() first_name: string;
  @ApiProperty() last_name: string;
  @ApiProperty() email: string;
  @ApiPropertyOptional({ nullable: true }) picture: string | null;
}

/** One row of the admin "business access requests" list/review screen. */
export class AdminBusinessAccessRequestDto {
  @ApiProperty() id: number;
  @ApiProperty() company_name: string;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'REJECTED'] }) status: 'PENDING' | 'APPROVED' | 'REJECTED';
  @ApiPropertyOptional({ nullable: true }) rejection_reason: string | null;
  @ApiProperty() created_at: Date;
  @ApiPropertyOptional({ nullable: true }) decided_at: Date | null;
  @ApiProperty({ type: BusinessAccessRequestUserDto }) user: BusinessAccessRequestUserDto;
  @ApiPropertyOptional({ type: BusinessAccessRequestUserDto, nullable: true }) decided_by: BusinessAccessRequestUserDto | null;
}
