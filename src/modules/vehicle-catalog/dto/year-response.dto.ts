import { ApiProperty } from '@nestjs/swagger';

export class YearResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  modelId: number;

  @ApiProperty()
  year: number;
}
