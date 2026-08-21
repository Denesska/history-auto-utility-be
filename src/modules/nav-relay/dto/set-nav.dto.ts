import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetNavDto {
  @ApiProperty({
    example: 'https://maps.app.goo.gl/abc123',
    description: 'The raw text shared from Google Maps — a link, or a link embedded in text.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  readonly url: string;
}
