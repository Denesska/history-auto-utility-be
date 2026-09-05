import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMaintenanceProfileDto {
  @ApiProperty({ example: 'Iarnă' })
  @IsString()
  @Length(1, 60)
  readonly name: string;
}
