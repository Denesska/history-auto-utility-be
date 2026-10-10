import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBusinessAccessRequestDto {
  @ApiProperty({ example: 'Acme Fleet SRL' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  company_name: string;

  @ApiPropertyOptional({ example: 'We manage a fleet of 12 vans in Bucharest.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
