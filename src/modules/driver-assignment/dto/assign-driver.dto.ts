import { IsInt, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignDriverDto {
  @ApiProperty({ example: 42, description: 'User id of the driver — must be an accepted member of the car\'s organization.' })
  @IsInt()
  readonly driver_user_id: number;

  @ApiPropertyOptional({ example: 'Starts Monday, covering the Cluj route' })
  @IsOptional()
  @IsString()
  readonly notes?: string;
}
