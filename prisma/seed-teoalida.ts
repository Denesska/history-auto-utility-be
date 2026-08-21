/**
 * Seed script: imports make/model pairs from the Teoalida European Car Database
 * (prisma/seed-data/teoalida-make-model.sql) to fill in European-market models
 * missing from the NHTSA ('nhtsa') and cars-base.ru ('cars-base') seeds.
 *
 * NHTSA is US-registration data, so brands also sold in the US (VW, Audi,
 * Mercedes-Benz, Opel, Renault, Peugeot, Toyota, ...) are only missing their
 * EU-only models (e.g. VW Polo, Up!, T-Roc — never sold in the US). We import
 * for ALL brands and rely on per-model dedup (skip if a model with the same
 * normalized name already exists under that make) rather than skipping whole
 * brands.
 *
 * BMW is the one exception — it's skipped entirely here because the Teoalida
 * sheet only has generic German series placeholders for it ("5er-Reihe"
 * instead of actual models), which were replaced separately with a strict,
 * specific-trim list (see seed-bmw-strict.ts).
 *
 * 'VW Nutzfahrzeuge' is merged into the existing 'Volkswagen' make, since
 * it's the same manufacturer's commercial-van lineup (Caddy, Transporter,
 * Crafter, ...).
 *
 * Mercedes-Benz model lines use German "-Klasse" naming in this sheet
 * ("A-Klasse") while NHTSA already stores them in English ("A-Class") — we
 * translate "-Klasse" -> "-Class" so they dedup against the existing rows
 * instead of creating German-named duplicates.
 *
 * The source file also has mojibake (UTF-8 bytes re-decoded as Latin-1, e.g.
 * "CoupÃ©" instead of "Coupé") — fixed via a Latin-1 -> UTF-8 round trip.
 *
 * Run:
 *   npx ts-node prisma/seed-teoalida.ts
 *
 * Safe to re-run — all writes are upserts/creates that never overwrite
 * existing rows.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const SOURCE = 'teoalida';
const DATA_FILE = path.join(__dirname, 'seed-data', 'teoalida-make-model.sql');

// BMW has its own strict, specific-trim seed (seed-bmw-strict.ts) — don't
// re-merge the generic German series placeholders from this sheet.
const SKIP_BRANDS = new Set(['bmw']);

// Raw Teoalida brand (lowercased) -> canonical display name to store as.
const BRAND_ALIASES: Record<string, string> = {
  'vw': 'Volkswagen',
  'vw nutzfahrzeuge': 'Volkswagen',
};

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

// Repairs UTF-8 text that was mistakenly re-decoded as Latin-1 (mojibake),
// e.g. "CoupÃ©" -> "Coupé". No-op for plain ASCII strings.
function fixMojibake(s: string): string {
  return Buffer.from(s, 'latin1').toString('utf8');
}

// German model-line naming -> English, so it dedups against NHTSA rows
// instead of creating a separate German-named entry (e.g. Mercedes-Benz
// "A-Klasse" vs the existing "A-Class").
function fixGermanClassSuffix(s: string): string {
  return s.replace(/-Klasse$/i, '-Class');
}

const ts = (): string => new Date().toISOString().replace('T', ' ').slice(0, 19);

async function main(): Promise<void> {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');

  const rowPattern = /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g;
  const rows: Array<{ brand: string; model: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(raw)) !== null) {
    rows.push({ brand: match[1], model: match[2] });
  }

  console.log(`[${ts()}] Parsed ${rows.length} rows from ${DATA_FILE}`);

  let skipped = 0;
  let added = 0;
  let alreadyPresent = 0;
  const makeCache = new Map<string, number>(); // normalized make name -> id

  for (const { brand: rawBrand, model: rawModel } of rows) {
    const rawBrandLower = normalize(rawBrand);

    if (SKIP_BRANDS.has(rawBrandLower)) {
      skipped++;
      continue;
    }

    const displayBrand = BRAND_ALIASES[rawBrandLower] ?? fixMojibake(rawBrand.trim());
    const displayModel = fixGermanClassSuffix(fixMojibake(rawModel.trim()));
    if (!displayModel) continue;

    const makeNorm = normalize(displayBrand);

    let makeId = makeCache.get(makeNorm);
    if (makeId === undefined) {
      const dbMake = await prisma.carMake.upsert({
        where: { normalized_name: makeNorm },
        update: {},
        create: { name: displayBrand, normalized_name: makeNorm, source: SOURCE },
      });
      makeId = dbMake.id;
      makeCache.set(makeNorm, makeId);
    }

    const modelNorm = normalize(displayModel);
    const existing = await prisma.carCatalogModel.findUnique({
      where: { make_id_normalized_name: { make_id: makeId, normalized_name: modelNorm } },
    });

    if (existing) {
      alreadyPresent++;
      continue;
    }

    await prisma.carCatalogModel.create({
      data: { make_id: makeId, name: displayModel, normalized_name: modelNorm, source: SOURCE },
    });
    added++;
  }

  console.log(
    `[${ts()}] Seed complete.\n` +
    `  Rows parsed       : ${rows.length}\n` +
    `  Skipped (covered) : ${skipped}\n` +
    `  Already present   : ${alreadyPresent}\n` +
    `  Models added      : ${added}\n` +
    `  Makes touched     : ${makeCache.size}`,
  );
}

main()
  .catch(err => { console.error('[FATAL]', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
