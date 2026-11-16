/**
 * Prisma 7 CLI config (schema location + the connection URL for Migrate / `db push`).
 * Prisma 7 no longer auto-loads any `.env`. SAFETY: we deliberately do NOT fall back to `.env`
 * (which points at the PROD database `hau_db`). The URL must come from either an inline
 * `DATABASE_URL=...` (db:push:dev / db:push:test) or an explicitly chosen `ENV_FILE=.env.xxx`.
 * `dotenv.config()` never overrides variables that are already set, so inline DATABASE_URL wins.
 * With neither set, the URL is empty and any DB command fails loudly (`prisma generate`/`validate` don't need it).
 */
import * as dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

if (process.env.ENV_FILE) dotenv.config({ path: process.env.ENV_FILE });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
