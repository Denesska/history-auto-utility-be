import { ApiProperty } from '@nestjs/swagger';
import { PushPlatform } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class RegisterPushTokenDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ enum: PushPlatform })
  @IsEnum(PushPlatform)
  platform: PushPlatform;
}
