import { ApiProperty } from '@nestjs/swagger';
import { OrganizationMembershipDto } from './organization.dto';

/** The plaintext password is returned exactly once, right after creation — it's hashed immediately afterward and can never be read back, only reset to a new generic one. */
export class LocalAccountCredentialsDto {
  /** Internal identifier (`<username>@<login_code>`) — not shown or typed anywhere in the UI. */
  @ApiProperty() email: string;
  @ApiProperty() password: string;
  /** The short, globally-unique login username (what the member types to log in). */
  @ApiProperty() username: string;
}

export class CreateLocalMemberResultDto {
  @ApiProperty({ type: OrganizationMembershipDto }) membership: OrganizationMembershipDto;
  @ApiProperty({ type: LocalAccountCredentialsDto }) credentials: LocalAccountCredentialsDto;
}
