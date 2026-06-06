import { ApiProperty } from '@nestjs/swagger';

export class ModelResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  makeId: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  normalizedName: string;
}
