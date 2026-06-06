/**
 * Seed script: populates car_makes / car_models / car_model_years from NHTSA vPIC.
 *
 * Run:
 *   npx ts-node prisma/seed-vehicle-catalog.ts
 *
 * Safe to re-run — all writes are upserts.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Config ───────────────────────────────────────────────────────────────────

const SOURCE = 'nhtsa';
const START_YEAR = 1990;
const CURRENT_YEAR = new Date().getFullYear();
const REQUEST_DELAY_MS = 300;
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Makes available in NHTSA vPIC (vehicle type = car).
 * Key = NHTSA MakeName normalised to lowercase, Value = canonical display name we store.
 *
 * NOT in NHTSA (Europe-only brands with no US registration): Dacia, Land Rover,
 * Citroen, SEAT, Skoda. Add them via a separate data source if needed.
 *
 * NHTSA uses ALL-CAPS for some brands (FIAT, HYUNDAI, KIA, OPEL, PEUGEOT, RENAULT)
 * — normalization handles that automatically.
 */
const TARGET_MAKES: Record<string, string> = {
  'bmw':           'BMW',
  'mercedes-benz': 'Mercedes-Benz',
  'audi':          'Audi',
  'volkswagen':    'Volkswagen',
  'renault':       'Renault',
  'peugeot':       'Peugeot',
  'toyota':        'Toyota',
  'honda':         'Honda',
  'nissan':        'Nissan',
  'ford':          'Ford',
  'opel':          'Opel',
  'volvo':         'Volvo',
  'mazda':         'Mazda',
  'hyundai':       'Hyundai',
  'kia':           'Kia',
  'fiat':          'Fiat',
  'alfa romeo':    'Alfa Romeo',
  'jeep':          'Jeep',
  'porsche':       'Porsche',
  'mini':          'MINI',
};

// ─── NHTSA types ──────────────────────────────────────────────────────────────

interface NhtsaMake {
  MakeId: number;
  MakeName: string;
}

interface NhtsaModel {
  Make_ID: number;
  Make_Name: string;
  Model_ID: number;
  Model_Name: string;
}

interface NhtsaResponse<T> {
  Count: number;
  Message: string;
  Results: T[] | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

const ts = (): string => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[${ts()}] Fetching car makes from NHTSA...`);

  const makesRes = await fetchJson<NhtsaResponse<NhtsaMake>>(
    'https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/car?format=json',
  );

  const allMakes = makesRes.Results ?? [];
  const matched = allMakes.filter(m => normalize(m.MakeName) in TARGET_MAKES);

  console.log(`[${ts()}] NHTSA: ${allMakes.length} total car makes → ${matched.length} matched our target list`);

  const notFound = Object.keys(TARGET_MAKES).filter(
    t => !matched.some(m => normalize(m.MakeName) === t),
  );
  if (notFound.length) {
    console.warn(`[WARN] Not found in NHTSA: ${notFound.map(k => TARGET_MAKES[k]).join(', ')}`);
  }

  let grandTotalPairs = 0;

  for (const nhtsaMake of matched) {
    const makeName  = nhtsaMake.MakeName;
    const makeNorm  = normalize(makeName);
    // Use our canonical display name if NHTSA uses a different casing
    const storeAs   = TARGET_MAKES[makeNorm] ?? makeName;

    const dbMake = await prisma.carMake.upsert({
      where:  { normalized_name: makeNorm },
      update: { source: SOURCE, external_id: String(nhtsaMake.MakeId) },
      create: {
        name:            storeAs,
        normalized_name: makeNorm,
        source:          SOURCE,
        external_id:     String(nhtsaMake.MakeId),
      },
    });

    console.log(`\n[${ts()}] ▶ ${storeAs}  (NHTSA MakeId=${nhtsaMake.MakeId})`);

    let makePairs  = 0;
    let makeErrors = 0;

    for (let year = START_YEAR; year <= CURRENT_YEAR; year++) {
      await sleep(REQUEST_DELAY_MS);

      const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(makeName)}/modelyear/${year}?format=json`;

      let models: NhtsaModel[] = [];
      try {
        const res = await fetchJson<NhtsaResponse<NhtsaModel>>(url);
        models = res.Results ?? [];
      } catch (err) {
        makeErrors++;
        console.error(`  [ERR] ${storeAs} ${year}: ${(err as Error).message}`);
        continue;
      }

      if (models.length === 0) continue;

      for (const nhtsaModel of models) {
        const modelName = nhtsaModel.Model_Name?.trim();
        if (!modelName) continue;

        const modelNorm = normalize(modelName);

        let dbModel;
        try {
          dbModel = await prisma.carCatalogModel.upsert({
            where:  { make_id_normalized_name: { make_id: dbMake.id, normalized_name: modelNorm } },
            update: { source: SOURCE, external_id: String(nhtsaModel.Model_ID) },
            create: {
              make_id:         dbMake.id,
              name:            modelName,
              normalized_name: modelNorm,
              source:          SOURCE,
              external_id:     String(nhtsaModel.Model_ID),
            },
          });

          await prisma.carModelYear.upsert({
            where:  { model_id_year: { model_id: dbModel.id, year } },
            update: {},
            create: { model_id: dbModel.id, year, source: SOURCE },
          });

          makePairs++;
        } catch (err) {
          makeErrors++;
          console.error(`  [ERR] upsert ${storeAs} / ${modelName} / ${year}: ${(err as Error).message}`);
        }
      }

      console.log(`  ${year}: ${models.length} model(s)`);
    }

    grandTotalPairs += makePairs;
    console.log(`  ✔ ${storeAs}: ${makePairs} model-year pairs, ${makeErrors} error(s)`);
  }

  console.log(`\n[${ts()}] Seed complete. ${grandTotalPairs} total model-year pairs across ${matched.length} makes.`);
}

main()
  .catch(err => { console.error('[FATAL]', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
