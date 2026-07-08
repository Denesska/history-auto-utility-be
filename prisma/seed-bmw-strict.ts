/**
 * Replaces all BMW rows in car_models with the strict, specific-trim list
 * from prisma/seed-data/bmw-models-strict.sql (e.g. '320i', 'X5 40d', 'M3
 * Competition'), instead of the generic NHTSA/Teoalida series placeholders.
 *
 * Run:
 *   npx ts-node prisma/seed-bmw-strict.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const SOURCE = 'bmw-strict';
const DATA_FILE = path.join(__dirname, 'seed-data', 'bmw-models-strict.sql');

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

const ts = (): string => new Date().toISOString().replace('T', ' ').slice(0, 19);

async function main(): Promise<void> {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');

  const rowPattern = /\(\s*'BMW'\s*,\s*'([^']*)'\s*\)/g;
  const models: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(raw)) !== null) {
    models.push(match[1].trim());
  }
  console.log(`[${ts()}] Parsed ${models.length} BMW models from ${DATA_FILE}`);

  const bmw = await prisma.carMake.findUnique({ where: { normalized_name: 'bmw' } });
  if (!bmw) throw new Error('BMW make not found in car_makes');

  const existingModels = await prisma.carCatalogModel.findMany({
    where: { make_id: bmw.id },
    select: { id: true },
  });
  const existingIds = existingModels.map(m => m.id);

  console.log(`[${ts()}] Deleting ${existingIds.length} existing BMW models (and their year rows)...`);
  await prisma.carModelYear.deleteMany({ where: { model_id: { in: existingIds } } });
  await prisma.carCatalogModel.deleteMany({ where: { make_id: bmw.id } });

  let added = 0;
  for (const name of models) {
    const normalized_name = normalize(name);
    await prisma.carCatalogModel.upsert({
      where: { make_id_normalized_name: { make_id: bmw.id, normalized_name } },
      update: {},
      create: { make_id: bmw.id, name, normalized_name, source: SOURCE },
    });
    added++;
  }

  console.log(`[${ts()}] Done. Removed ${existingIds.length} old models, inserted ${added} BMW models from the strict list.`);
}

main()
  .catch(err => { console.error('[FATAL]', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
