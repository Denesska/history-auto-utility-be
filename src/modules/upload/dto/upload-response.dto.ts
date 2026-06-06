import { ApiProperty } from '@nestjs/swagger';

export class UploadResponseDto {
  @ApiProperty()
  fileId: number;

  @ApiProperty()
  fileKey: string;

  @ApiProperty()
  uploadUrl: string;

  @ApiProperty()
  expiresIn: number;
}

export class ConfirmUploadResponseDto {
  @ApiProperty()
  fileId: number;

  @ApiProperty()
  fileKey: string;

  @ApiProperty()
  uploadedAt: string;
}

export class ReadUrlResponseDto {
  @ApiProperty()
  readUrl: string;

  @ApiProperty()
  expiresIn: number;
}
