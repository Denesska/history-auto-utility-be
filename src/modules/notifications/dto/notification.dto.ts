import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';

export class NotificationDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty({ type: Object })
  data: any;

  @ApiProperty({ nullable: true })
  read_at: Date | null;

  @ApiProperty()
  created_at: Date;
}

export class UnreadCountDto {
  @ApiProperty()
  count: number;
}
