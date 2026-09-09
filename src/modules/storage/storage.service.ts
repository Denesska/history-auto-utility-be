import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, DeleteObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * `filename` keeps only characters that are safe inside a quoted HTTP header
 * value (for old clients); `filename*` carries the real, possibly non-ASCII
 * name (RFC 5987) and is what every current browser actually uses.
 */
function buildAttachmentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly defaultExpiresIn: number;

  constructor(private readonly config: ConfigService) {
    const accountId = config.getOrThrow<string>('R2_ACCOUNT_ID');
    this.bucket = config.getOrThrow<string>('R2_BUCKET_NAME');
    this.defaultExpiresIn = Number(config.get<string>('R2_SIGNED_URL_EXPIRY') ?? '3600');

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  createPresignedPutUrl(key: string, mimeType: string, expiresIn?: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresIn ?? this.defaultExpiresIn });
  }

  /**
   * @param downloadFileName when set, the signed URL carries a
   *   `Content-Disposition: attachment` override, so following it saves the file
   *   under that name instead of rendering it in the browser. This is the only
   *   way to force a real download for a cross-origin object — the HTML
   *   `download` attribute is ignored on another origin.
   */
  createPresignedGetUrl(key: string, expiresIn?: number, downloadFileName?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(downloadFileName
        ? { ResponseContentDisposition: buildAttachmentDisposition(downloadFileName) }
        : {}),
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresIn ?? this.defaultExpiresIn });
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
