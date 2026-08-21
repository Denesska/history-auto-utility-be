import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateDeadlineOrderDto {
  @ApiProperty({
    type: [String],
    example: ['doc:RCA', 'plan:OIL_CHANGE', 'doc:ITP'],
    description: 'Send an empty array to drop the manual order and go back to sorting by urgency.',
  })
  @IsArray()
  // Bounded on purpose: this is a list of a car's own deadlines, not free storage.
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  readonly order: string[];
}
