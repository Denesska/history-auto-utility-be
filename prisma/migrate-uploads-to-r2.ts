/**
 * One-time migration script: uploads local files to Cloudflare R2 and updates DB records.
 *
 * Run with:
 *   ENV_FILE=.env.dev npx ts-node prisma/migrate-uploads-to-r2.ts
 *
 * Safe to re-run — already-migrated records (key doesn't start with '/') are skipped.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';

const ENV_FILE = process.env.ENV_FILE ?? '.env';
dotenv.config({ path: path.resolve(process.cwd(), ENV_FILE), override: true });

const UPLOADS_ROOT = path.resolve(__dirname, '..', 'uploads');
const DB_URL = process.env.DATABASE_URL!;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
const BUCKET = process.env.R2_BUCKET_NAME!;

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
};

function mimeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

/** Extract just the filename from a local path (/uploads/cars/foo.jpg) or full URL. */
function extractFilename(urlOrPath: string): string {
  return path.basename(urlOrPath.replace(/\?.*$/, ''));
}

/** Returns true if this value is already an R2 key (was previously migrated). */
function isAlreadyR2(value: string | null): boolean {
  if (!value) return false;
  return !value.startsWith('/') && !value.startsWith('http');
}

async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function uploadFile(localPath: string, r2Key: string): Promise<void> {
  if (!fs.existsSync(localPath)) {
    console.warn(`  ⚠ File not found on disk, skipping: ${localPath}`);
    return;
  }
  if (await objectExists(r2Key)) {
    console.log(`  ↷ Already in R2: ${r2Key}`);
    return;
  }
  const body = fs.readFileSync(localPath);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: r2Key,
    Body: body,
    ContentType: mimeFromPath(localPath),
  }));
  console.log(`  ✓ Uploaded: ${r2Key}`);
}

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

  try {
    // ── CarPhoto ─────────────────────────────────────────────────────────────
    console.log('\n── CarPhoto ──────────────────────────────────────────');
    const photos = await prisma.carPhoto.findMany();
    for (const photo of photos) {
      if (isAlreadyR2(photo.url)) {
        console.log(`  ↷ Already R2 (id=${photo.id}): ${photo.url}`);
        continue;
      }
      const filename = extractFilename(photo.url);
      const r2Key = `migrate/cars/${filename}`;
      const localPath = path.join(UPLOADS_ROOT, 'cars', filename);

      await uploadFile(localPath, r2Key);
      await prisma.carPhoto.update({ where: { id: photo.id }, data: { url: r2Key } });
      console.log(`  DB updated CarPhoto id=${photo.id} → ${r2Key}`);
    }

    // ── Document ─────────────────────────────────────────────────────────────
    console.log('\n── Document ──────────────────────────────────────────');
    const docs = await prisma.document.findMany({ where: { file_url: { not: null } } });
    for (const doc of docs) {
      if (isAlreadyR2(doc.file_url)) {
        console.log(`  ↷ Already R2 (id=${doc.id}): ${doc.file_url}`);
        continue;
      }
      const filename = extractFilename(doc.file_url!);
      const r2Key = `migrate/documents/${filename}`;
      const localPath = path.join(UPLOADS_ROOT, 'documents', filename);

      await uploadFile(localPath, r2Key);
      await prisma.document.update({ where: { id: doc.id }, data: { file_url: r2Key } });
      console.log(`  DB updated Document id=${doc.id} → ${r2Key}`);
    }

    // ── BlogImage ─────────────────────────────────────────────────────────────
    console.log('\n── BlogImage ─────────────────────────────────────────');
    const blogImages = await prisma.blogImage.findMany();
    for (const img of blogImages) {
      if (isAlreadyR2(img.url)) {
        console.log(`  ↷ Already R2 (id=${img.id}): ${img.url}`);
        continue;
      }
      const filename = extractFilename(img.url);
      const r2Key = `migrate/blog/${filename}`;
      const localPath = path.join(UPLOADS_ROOT, 'blog', filename);

      await uploadFile(localPath, r2Key);
      await prisma.blogImage.update({ where: { id: img.id }, data: { url: r2Key } });
      console.log(`  DB updated BlogImage id=${img.id} → ${r2Key}`);
    }

    // ── BlogEntry.cover_image_url ─────────────────────────────────────────────
    console.log('\n── BlogEntry cover images ────────────────────────────');
    const entries = await prisma.blogEntry.findMany({ where: { cover_image_url: { not: null } } });
    for (const entry of entries) {
      if (isAlreadyR2(entry.cover_image_url)) {
        console.log(`  ↷ Already R2 (id=${entry.id}): ${entry.cover_image_url}`);
        continue;
      }
      const filename = extractFilename(entry.cover_image_url!);
      const r2Key = `migrate/blog/${filename}`;
      const localPath = path.join(UPLOADS_ROOT, 'blog', filename);

      await uploadFile(localPath, r2Key);
      await prisma.blogEntry.update({ where: { id: entry.id }, data: { cover_image_url: r2Key } });
      console.log(`  DB updated BlogEntry id=${entry.id} cover_image_url → ${r2Key}`);
    }

    console.log('\n✅ Migration complete.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
