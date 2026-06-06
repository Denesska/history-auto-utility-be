import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CarAccessRole } from '@prisma/client';

export class CarAccessUserDto {
  @ApiProperty() id: number;
  @ApiProperty() email: string;
  @ApiProperty() first_name: string;
  @ApiProperty() last_name: string;
  @ApiPropertyOptional() picture?: string;
}

export class CarAccessDto {
  @ApiProperty() id: number;
  @ApiProperty() car_id: number;
  @ApiProperty({ enum: CarAccessRole }) role: CarAccessRole;
  @ApiProperty({ type: CarAccessUserDto }) user: CarAccessUserDto;
  @ApiProperty({ type: CarAccessUserDto }) invited_by: CarAccessUserDto;
  @ApiPropertyOptional() accepted_at: Date | null;
  @ApiProperty() created_at: Date;
}

export class SharedCarDto {
  @ApiProperty() id: number;
  @ApiProperty() make: string;
  @ApiProperty() model: string;
  @ApiPropertyOptional() variant: string | null;
  @ApiProperty() year: number;
  @ApiProperty() license_plate: string;
  @ApiProperty({ enum: CarAccessRole }) shared_role: CarAccessRole;
  @ApiPropertyOptional() accepted_at: Date | null;
}
