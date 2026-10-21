import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({ description: "Must equal the account's own email address (case-insensitive), to confirm an irreversible deletion." })
  @IsString()
  @IsNotEmpty()
  confirmation: string;
}
