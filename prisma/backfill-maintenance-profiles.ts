/**
 * One-off backfill for the "named custom maintenance profiles" feature.
 *
 * Before this feature, CarMaintenanceSetting rows had no profile — they were an
 * implicit single per-(car,user) override bucket. The schema now requires every
 * row to belong to a MaintenanceProfile (see schema.prisma). This script finds
 * every distinct (car_id, user_id) with existing `profile_id = null` rows,
 * creates one MaintenanceProfile named "Profilul meu" for each, and reassigns
 * those rows to it — so existing customizations keep working identically,
 * just under a named profile instead of an implicit one.
 *
 * Safe to re-run — once no `profile_id = null` rows remain, it's a no-op.
 *
 * DEV ONLY. Run via:
 *   npm run backfill:maintenance-profiles:dev
 * which pins DATABASE_URL to hau_db_dev — never invoke this script directly
 * with a bare `ts-node`/`npx ts-node`, since PrismaClient() with no override
 * falls back to .env, which points at the PROD database (hau_db).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const orphanRows = await prisma.carMaintenanceSetting.findMany({
    where: { profile_id: null },
    select: { car_id: true, user_id: true },
    distinct: ['car_id', 'user_id'],
  });

  console.log(`Found ${orphanRows.length} (car_id, user_id) pair(s) with unassigned maintenance settings.`);

  for (const { car_id, user_id } of orphanRows) {
    const profile = await prisma.maintenanceProfile.upsert({
      where: { car_id_user_id_name: { car_id, user_id, name: 'Profilul meu' } },
      create: { car_id, user_id, name: 'Profilul meu' },
      update: {},
    });

    const { count } = await prisma.carMaintenanceSetting.updateMany({
      where: { car_id, user_id, profile_id: null },
      data: { profile_id: profile.id },
    });

    console.log(`car_id=${car_id} user_id=${user_id}: reassigned ${count} row(s) to profile "${profile.name}" (id=${profile.id}).`);
  }

  const remaining = await prisma.carMaintenanceSetting.count({ where: { profile_id: null } });
  console.log(`Done. Remaining profile_id=null rows: ${remaining}.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
