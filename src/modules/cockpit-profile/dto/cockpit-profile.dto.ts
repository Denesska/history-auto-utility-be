import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * What the car gets back. The stored document verbatim, or an empty object when this channel has
 * never been written to — which the car reads as "the cloud has nothing", not as an error, and is
 * then free to upload what it has.
 */
export class CockpitProfileDto {
  @ApiPropertyOptional({ example: 1 })
  readonly version?: number;

  @ApiPropertyOptional({ example: 12 })
  readonly revision?: number;

  @ApiPropertyOptional({ example: 1721400000 })
  readonly updatedAt?: number;

  @ApiPropertyOptional()
  readonly prefs?: Record<string, unknown>;

  @ApiPropertyOptional()
  readonly files?: Record<string, string>;
}
