import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Fleet SRL' })
  @IsString()
  @MinLength(2)
  name: string;
}
