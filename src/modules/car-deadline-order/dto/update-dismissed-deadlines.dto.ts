import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateDismissedDeadlinesDto {
  @ApiProperty({
    type: [String],
    example: ['doc:ROV'],
    description: 'Send an empty array to un-dismiss everything.',
  })
  @IsArray()
  // Bounded on purpose: this is a list of a car's own deadlines, not free storage.
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  readonly dismissed: string[];
}
