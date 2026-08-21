import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * What the car polls for. An empty object (all fields absent) is a valid "nothing shared yet"
 * answer — the car treats a missing/zero [id] as no destination.
 */
export class NavDestinationDto {
  @ApiPropertyOptional({ example: 42, description: 'Ever-increasing id; the car acts when it grows.' })
  readonly id?: number;

  @ApiPropertyOptional({ example: 'Strada Republicii, Brașov' })
  readonly name?: string | null;

  @ApiPropertyOptional({ example: 45.6427 })
  readonly lat?: number | null;

  @ApiPropertyOptional({ example: 25.5887 })
  readonly lon?: number | null;

  @ApiPropertyOptional({ example: 1721400000, description: 'Unix seconds when it was shared.' })
  readonly ts?: number;
}
