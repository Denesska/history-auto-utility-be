/**
 * Prisma 7 CLI config (schema location + the connection URL for Migrate/`db push`).
 * The CLI no longer auto-loads any `.env` file on its own (see
 * https://pris.ly/d/config-datasource), so we replicate `main.ts`'s own
 * `ENV_FILE` convention here: `dotenv.config()` only fills in vars that are
 * not already set, so the explicit inline `DATABASE_URL=... prisma db push`
 * in `db:push:dev` / `db:push:test` still wins over whatever `.env`/`.env.dev`
 * also declares.
 */
import * as dotenv from 'dotenv';
import { defineConfig, env } from 'prisma/config';

dotenv.config({ path: process.env.ENV_FILE ?? '.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
