import { ApiProperty } from '@nestjs/swagger';

/** The new plaintext password is returned exactly once — same convention as CreateLocalMemberResultDto. */
export class ResetLocalPasswordResultDto {
  @ApiProperty() password: string;
}
