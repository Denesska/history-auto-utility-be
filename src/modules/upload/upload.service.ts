import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  ALLOWED_MIME_TYPES,
  ContextType,
  MAX_IMAGE_SIZE,
  MAX_PDF_SIZE,
  RequestUploadDto,
} from './dto/request-upload.dto';
import {
  ConfirmUploadResponseDto,
  ReadUrlResponseDto,
  UploadResponseDto,
} from './dto/upload-response.dto';

@Injectable()
export class UploadService {
  private readonly expiresIn: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.expiresIn = Number(config.get<string>('R2_SIGNED_URL_EXPIRY') ?? '3600');
  }

  async requestUpload(userId: number, dto: RequestUploadDto): Promise<UploadResponseDto> {
    this.validateSize(dto.mimeType, dto.size);

    const safeFileName = this.sanitizeFileName(dto.originalFileName);
    const fileKey = this.buildKey(userId, dto.contextType, dto.contextId, safeFileName);

    const uploadUrl = await this.storage.createPresignedPutUrl(fileKey, dto.mimeType, this.expiresIn);

    const record = await this.prisma.uploadedFile.create({
      data: {
        user_id: userId,
        context_type: dto.contextType,
        context_id: dto.contextId ?? null,
        original_file_name: dto.originalFileName,
        file_key: fileKey,
        mime_type: dto.mimeType,
        size: dto.size,
        status: 'PENDING',
      },
    });

    return { fileId: record.id, fileKey, uploadUrl, expiresIn: this.expiresIn };
  }

  async confirmUpload(userId: number, fileId: number): Promise<ConfirmUploadResponseDto> {
    const record = await this.findOwnedRecord(userId, fileId);

    if (record.status === 'UPLOADED') {
      return {
        fileId: record.id,
        fileKey: record.file_key,
        uploadedAt: record.uploaded_at!.toISOString(),
      };
    }

    const now = new Date();
    const updated = await this.prisma.uploadedFile.update({
      where: { id: fileId },
      data: { status: 'UPLOADED', uploaded_at: now },
    });

    // Link back to the owning entity so its file_url always points to R2
    if (record.context_type === 'document' && record.context_id != null) {
      await this.prisma.document.update({
        where: { id: record.context_id },
        data: {
          file_url: record.file_key,
          file_name: record.original_file_name,
          file_size: record.size,
        },
      });
    }

    return {
      fileId: updated.id,
      fileKey: updated.file_key,
      uploadedAt: updated.uploaded_at!.toISOString(),
    };
  }

  async getReadUrl(userId: number, fileId: number): Promise<ReadUrlResponseDto> {
    const record = await this.findOwnedRecord(userId, fileId);
    const readUrl = await this.storage.createPresignedGetUrl(record.file_key, this.expiresIn);
    return { readUrl, expiresIn: this.expiresIn };
  }

  async deleteFile(userId: number, fileId: number): Promise<void> {
    const record = await this.findOwnedRecord(userId, fileId);

    await this.storage.deleteObject(record.file_key);

    await this.prisma.uploadedFile.update({
      where: { id: fileId },
      data: { status: 'DELETED', deleted_at: new Date() },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async findOwnedRecord(userId: number, fileId: number) {
    const record = await this.prisma.uploadedFile.findUnique({ where: { id: fileId } });
    if (!record || record.status === 'DELETED') throw new NotFoundException('File not found');
    if (record.user_id !== userId) throw new ForbiddenException('Access denied');
    return record;
  }

  private validateSize(mimeType: string, size: number): void {
    if (!ALLOWED_MIME_TYPES.includes(mimeType as any)) {
      throw new BadRequestException(`Unsupported MIME type: ${mimeType}`);
    }
    const maxSize = mimeType === 'application/pdf' ? MAX_PDF_SIZE : MAX_IMAGE_SIZE;
    if (size > maxSize) {
      const mb = (maxSize / 1024 / 1024).toFixed(0);
      throw new BadRequestException(`File exceeds maximum allowed size of ${mb} MB`);
    }
  }

  private sanitizeFileName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9.\-_]/g, '-')
      .replace(/-{2,}/g, '-')
      .slice(0, 100);
  }

  private buildKey(userId: number, contextType: ContextType, contextId: number | undefined, safeFileName: string): string {
    const segment = contextId != null ? contextId.toString() : 'unassigned';
    return `users/${userId}/${contextType}/${segment}/${uuid()}-${safeFileName}`;
  }
}
