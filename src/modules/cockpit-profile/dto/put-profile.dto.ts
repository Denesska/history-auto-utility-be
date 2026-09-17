import { IsInt, IsObject, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The profile document the car uploads. Only the envelope is validated — `prefs` and `files` are
 * stored verbatim and never read here, so a new setting on the car needs no change on the server.
 */
export class PutProfileDto {
  @ApiProperty({ example: 1, description: 'Snapshot format version written by the car.' })
  @IsInt()
  @Min(1)
  readonly version: number;

  @ApiProperty({
    example: 12,
    description:
      'Counts changes made on the device. Must not go backwards — a lower revision than the ' +
      'stored one is rejected, so a device that fell behind cannot overwrite a newer profile.',
  })
  @IsInt()
  @Min(0)
  readonly revision: number;

  @ApiPropertyOptional({ example: 1721400000, description: 'Unix seconds, from the head unit clock.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  readonly updatedAt?: number;

  @ApiProperty({ description: 'SharedPreferences files, keyed by name. Opaque to the server.' })
  @IsObject()
  readonly prefs: Record<string, unknown>;

  @ApiProperty({ description: 'Data files (favourites, speed dial) as raw text. Opaque to the server.' })
  @IsObject()
  readonly files: Record<string, string>;
}
