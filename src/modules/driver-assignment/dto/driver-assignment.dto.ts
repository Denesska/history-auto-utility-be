import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignmentUserDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'driver@example.com' })
  email: string;

  @ApiProperty({ example: 'Ion' })
  first_name: string;

  @ApiProperty({ example: 'Popescu' })
  last_name: string;

  @ApiProperty({ example: 'https://...' })
  picture: string;
}

export class DriverAssignmentDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 148 })
  car_id: number;

  @ApiProperty({ type: AssignmentUserDto })
  driver: AssignmentUserDto;

  @ApiProperty({ type: AssignmentUserDto })
  assigned_by: AssignmentUserDto;

  @ApiProperty()
  started_at: Date;

  @ApiPropertyOptional({ nullable: true, description: 'Null = this is the car\'s current driver.' })
  ended_at: Date | null;

  @ApiPropertyOptional({ nullable: true })
  notes: string | null;
}
