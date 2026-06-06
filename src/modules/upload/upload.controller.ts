import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { UploadService } from './upload.service';
import { RequestUploadDto } from './dto/request-upload.dto';
import {
  ConfirmUploadResponseDto,
  ReadUrlResponseDto,
  UploadResponseDto,
} from './dto/upload-response.dto';

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('request')
  @ApiOperation({
    summary: 'Request a signed upload URL',
    description:
      'Validates the file metadata and returns a pre-signed PUT URL for direct upload to R2. ' +
      'A pending DB record is created. After uploading, call POST /upload/:id/confirm.',
  })
  @ApiResponse({ status: 201, type: UploadResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid file type or size.' })
  requestUpload(
    @Req() req: RequestWithUser,
    @Body() dto: RequestUploadDto,
  ): Promise<UploadResponseDto> {
    return this.uploadService.requestUpload(req.user.id, dto);
  }

  @Post(':id/confirm')
  @ApiOperation({
    summary: 'Confirm upload completed',
    description:
      'Must be called after the frontend has successfully PUT the file to R2. ' +
      'Transitions the file record from pending to uploaded.',
  })
  @ApiResponse({ status: 201, type: ConfirmUploadResponseDto })
  @ApiResponse({ status: 403, description: 'Not your file.' })
  @ApiResponse({ status: 404, description: 'File not found.' })
  confirmUpload(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ConfirmUploadResponseDto> {
    return this.uploadService.confirmUpload(req.user.id, id);
  }

  @Get(':id/url')
  @ApiOperation({
    summary: 'Get a signed read URL for a file',
    description: 'Returns a temporary signed GET URL. File must be owned by the authenticated user.',
  })
  @ApiResponse({ status: 200, type: ReadUrlResponseDto })
  @ApiResponse({ status: 403, description: 'Not your file.' })
  @ApiResponse({ status: 404, description: 'File not found.' })
  getReadUrl(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ReadUrlResponseDto> {
    return this.uploadService.getReadUrl(req.user.id, id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a file',
    description: 'Deletes the object from R2 and soft-deletes the DB record.',
  })
  @ApiResponse({ status: 200, description: 'File deleted.' })
  @ApiResponse({ status: 403, description: 'Not your file.' })
  @ApiResponse({ status: 404, description: 'File not found.' })
  async deleteFile(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.uploadService.deleteFile(req.user.id, id);
  }
}
