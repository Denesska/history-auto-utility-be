import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, ValidateIf } from 'class-validator';

export class SnoozeReminderDto {
  @ApiProperty({ description: 'A DOCUMENT_EXPIRING or MAINTENANCE_DUE notification of the current user' })
  @IsInt()
  notificationId: number;

  @ApiProperty({ nullable: true, enum: [7, 30], description: 'Days to stay silent; null = do not remind again for this item/cycle' })
  @ValidateIf((_o, v) => v !== null)
  @IsIn([7, 30])
  days: 7 | 30 | null;
}

export class SnoozeResultDto {
  @ApiProperty({ nullable: true })
  until: Date | null;
}

export class MuteCarDto {
  @ApiProperty({ nullable: true, enum: [1, 3, 6], description: 'Months to mute the car for; null = until turned back on' })
  @ValidateIf((_o, v) => v !== null)
  @IsIn([1, 3, 6])
  months: 1 | 3 | 6 | null;
}

export class CarMuteDto {
  @ApiProperty()
  carId: number;

  @ApiProperty({ nullable: true, description: 'Muted until this moment; null = until turned back on' })
  until: Date | null;
}
