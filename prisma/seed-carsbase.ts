/**
 * Seed script: imports European makes/models/years from api.cars-base.ru
 * to complement the NHTSA seed (Dacia, Citroen, Land Rover, SEAT, Skoda, etc.)
 *
 * Run:
 *   npx ts-node prisma/seed-carsbase.ts
 *
 * Safe to re-run — all writes are upserts.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Config ───────────────────────────────────────────────────────────────────

const SOURCE        = 'cars-base';
const API_URL       = 'https://api.cars-base.ru/full';
const START_YEAR    = 1970;          // include pre-1990 European classics
const CURRENT_YEAR  = new Date().getFullYear();

/**
 * Which makes to import, keyed by their cars-base.ru normalised name (lowercase).
 * Value = canonical display name stored in car_makes.
 *
 * Default list = makes with NO or very limited NHTSA data:
 *   - Not in NHTSA at all: Dacia, Citroen, Land Rover, SEAT, Skoda, Jeep
 *   - NHTSA returned 0 car-type results: Renault
 *   - NHTSA returned only US-market models: Opel, Peugeot
 *
 * Add or remove makes freely.
 */
const TARGET_MAKES: Record<string, string> = {
  'dacia':       'Dacia',
  'citroen':     'Citroen',
  'land rover':  'Land Rover',
  'seat':        'SEAT',
  'skoda':       'Skoda',
  'jeep':        'Jeep',
  'renault':     'Renault',
  'opel':        'Opel',
  'peugeot':     'Peugeot',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface CarsBaseMake {
  id:           string;
  name:         string;
  cyrillic_name: string;
  numeric_id:   number;
  year_from:    number | null;
  year_to:      number | null;
  popular:      number;
  country:      string;
  models:       CarsBaseModel[];
}

interface CarsBaseModel {
  id:           string;
  mark_id:      string;
  name:         string;
  cyrillic_name: string;
  year_from:    number | null;
  year_to:      number | null;
  class:        string;
}

interface ApiResponse {
  data: CarsBaseMake[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

const ts = (): string =>
  new Date().toISOString().replace('T', ' ').slice(0, 19);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[${ts()}] Downloading catalog from ${API_URL} ...`);

  const res = await fetch(API_URL, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  const json: ApiResponse = await res.json();
  const allMakes = json.data;
  console.log(`[${ts()}] Downloaded. Total makes in catalog: ${allMakes.length}`);

  // Index by normalised name for O(1) lookup
  const byNorm = new Map<string, CarsBaseMake>(
    allMakes.map(m => [normalize(m.name), m]),
  );

  // Resolve which target makes actually exist in the catalog
  const matched: Array<{ key: string; display: string; raw: CarsBaseMake }> = [];
  const notFound: string[] = [];

  for (const [key, display] of Object.entries(TARGET_MAKES)) {
    const raw = byNorm.get(key);
    if (raw) {
      matched.push({ key, display, raw });
    } else {
      notFound.push(display);
    }
  }

  if (notFound.length) {
    console.warn(`[WARN] Not found in cars-base.ru: ${notFound.join(', ')}`);
  }
  console.log(`[${ts()}] Processing ${matched.length} makes\n`);

  let grandModels = 0;
  let grandYears  = 0;

  for (const { display, raw } of matched) {
    const makeNorm = normalize(raw.name);

    // Upsert make — if it already exists (from NHTSA), only add external_id;
    // don't overwrite source so the NHTSA provenance is preserved.
    const dbMake = await prisma.carMake.upsert({
      where:  { normalized_name: makeNorm },
      update: { external_id: raw.id },          // keep existing source
      create: {
        name:            display,
        normalized_name: makeNorm,
        source:          SOURCE,
        external_id:     raw.id,
      },
    });

    console.log(`[${ts()}] ▶ ${display}  (cars-base id=${raw.id}, ${raw.models.length} models)`);

    let makeModels = 0;
    let makeYears  = 0;

    for (const carsModel of raw.models) {
      const modelName = carsModel.name?.trim();
      if (!modelName) continue;

      const modelNorm = normalize(modelName);

      const dbModel = await prisma.carCatalogModel.upsert({
        where:  { make_id_normalized_name: { make_id: dbMake.id, normalized_name: modelNorm } },
        update: { external_id: carsModel.id },  // keep existing source
        create: {
          make_id:         dbMake.id,
          name:            modelName,
          normalized_name: modelNorm,
          source:          SOURCE,
          external_id:     carsModel.id,
        },
      });

      makeModels++;

      // Generate year records from year_from → year_to
      const yearFrom = carsModel.year_from;
      const yearTo   = carsModel.year_to ?? CURRENT_YEAR;

      if (!yearFrom) continue;                  // skip models with no year data

      const from = Math.max(START_YEAR, yearFrom);
      const to   = Math.min(CURRENT_YEAR, yearTo);

      for (let year = from; year <= to; year++) {
        await prisma.carModelYear.upsert({
          where:  { model_id_year: { model_id: dbModel.id, year } },
          update: {},
          create: { model_id: dbModel.id, year, source: SOURCE },
        });
        makeYears++;
      }
    }

    grandModels += makeModels;
    grandYears  += makeYears;
    console.log(`  ✔ ${display}: ${makeModels} models, ${makeYears} year records\n`);
  }

  console.log(
    `[${ts()}] Seed complete.\n` +
    `  Makes  : ${matched.length}\n` +
    `  Models : ${grandModels}\n` +
    `  Years  : ${grandYears}`,
  );
}

main()
  .catch(err => { console.error('[FATAL]', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
