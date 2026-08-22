import { ApiProperty } from '@nestjs/swagger';

export class DeadlineOrderDto {
  @ApiProperty({ example: 1 })
  car_id: number;

  @ApiProperty({
    type: [String],
    example: ['doc:RCA', 'plan:OIL_CHANGE', 'doc:ITP'],
    description:
      'Ordered list of deadline keys. Empty means the user has no manual order and the client falls back to sorting by urgency.',
  })
  order: string[];

  @ApiProperty({
    type: [String],
    example: ['doc:ROV'],
    description: 'Deadline keys the user dismissed from the list entirely. Empty means nothing is dismissed.',
  })
  dismissed: string[];
}
