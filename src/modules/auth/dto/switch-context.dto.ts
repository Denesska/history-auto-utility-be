import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class SwitchContextDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  organizationId: number;
}
