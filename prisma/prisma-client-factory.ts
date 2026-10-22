/**
 * Shared PrismaClient construction for the standalone seed/migration scripts
 * in this directory (run directly via `ts-node`, outside of Nest's DI).
 *
 * Prisma 7 removed the `datasource.url` schema field — a `PrismaClient` now
 * needs a driver adapter instead (see https://pris.ly/d/driver-adapters).
 * The Nest app wires this through `ConfigService` in `src/prisma/prisma.service.ts`;
 * these scripts have no DI container, so they read `DATABASE_URL` directly.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export function createPrismaClient(connectionString: string = process.env.DATABASE_URL!): PrismaClient {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — pass it explicitly or export it before running this script.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
