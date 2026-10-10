import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectBusinessAccessRequestDto {
  @ApiPropertyOptional({ example: 'Could not verify the company — please get in touch at office@denhau.ro.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
