import { ApiProperty } from '@nestjs/swagger';

export class MakeResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  normalizedName: string;
}
