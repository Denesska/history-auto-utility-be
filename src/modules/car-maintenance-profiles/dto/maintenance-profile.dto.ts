import { ApiProperty } from '@nestjs/swagger';

export class MaintenanceProfileDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Profilul meu' })
  name: string;

  @ApiProperty({ example: '2026-09-04T10:00:00.000Z' })
  created_at: Date;
}
