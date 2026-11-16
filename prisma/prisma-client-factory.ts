/**
 * Shared PrismaClient construction for the standalone seed/migration scripts in this directory
 * (run via `ts-node`, outside Nest's DI). Prisma 7 removed the schema-level `datasource.url`; a
 * PrismaClient now connects through a driver adapter. The Nest app does the same in
 * `src/prisma/prisma.service.ts`; these scripts read `DATABASE_URL` directly.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export function createPrismaClient(connectionString: string = process.env.DATABASE_URL!): PrismaClient {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — pass it explicitly or export it before running this script.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
