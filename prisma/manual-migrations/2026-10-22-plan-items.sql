-- Plan items redesign (2026-10-22). Replayable on test/prod BEFORE `prisma db push`
-- (so the push finds nothing to drop/add). Run inside one transaction.
-- Reminder-state key rewrites (MaintenanceReminderSent / ReminderSnooze / CarDeadlineOrder)
-- are NOT here: they are owned by the reminders part of this change.
BEGIN;

CREATE TYPE "PlanItemKey" AS ENUM ('ENGINE_OIL','AIR_FILTER','CABIN_FILTER','FUEL_FILTER','GEARBOX_OIL','DIFFERENTIAL_OIL','BRAKE_FLUID','COOLANT','POWER_STEERING_FLUID','AC_SERVICE','TIRES','INSPECTION');
CREATE TYPE "DrivetrainType" AS ENUM ('FRONT','REAR','ALL_WHEEL');

ALTER TABLE "Car" ADD COLUMN "drivetrain" "DrivetrainType", ADD COLUMN "engine_oil_viscosity" TEXT;

CREATE TABLE "MaintenanceRecordPlanItem" (
  "id" SERIAL NOT NULL,
  "maintenance_record_id" INTEGER NOT NULL,
  "item" "PlanItemKey" NOT NULL,
  CONSTRAINT "MaintenanceRecordPlanItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MaintenanceRecordPlanItem_maintenance_record_id_item_key" ON "MaintenanceRecordPlanItem"("maintenance_record_id","item");
CREATE INDEX "MaintenanceRecordPlanItem_item_idx" ON "MaintenanceRecordPlanItem"("item");
ALTER TABLE "MaintenanceRecordPlanItem" ADD CONSTRAINT "MaintenanceRecordPlanItem_maintenance_record_id_fkey"
  FOREIGN KEY ("maintenance_record_id") REFERENCES "MaintenanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill records (only the unambiguous categories)
INSERT INTO "MaintenanceRecordPlanItem" ("maintenance_record_id","item")
SELECT id, (CASE service_category::text
  WHEN 'OIL_CHANGE' THEN 'ENGINE_OIL'
  WHEN 'TRANSMISSION_SERVICE' THEN 'GEARBOX_OIL'
  WHEN 'TIRE_SERVICE' THEN 'TIRES'
  WHEN 'INSPECTION' THEN 'INSPECTION' END)::"PlanItemKey"
FROM "MaintenanceRecord"
WHERE service_category::text IN ('OIL_CHANGE','TRANSMISSION_SERVICE','TIRE_SERVICE','INSPECTION')
ON CONFLICT DO NOTHING;

-- Settings: category -> item
ALTER TABLE "CarMaintenanceSetting" ADD COLUMN "item" "PlanItemKey", ADD COLUMN "custom_interval_oil_changes" INTEGER;
UPDATE "CarMaintenanceSetting" SET "item" = (CASE category::text
  WHEN 'OIL_CHANGE' THEN 'ENGINE_OIL'
  WHEN 'TRANSMISSION_SERVICE' THEN 'GEARBOX_OIL'
  WHEN 'TIRE_SERVICE' THEN 'TIRES'
  WHEN 'INSPECTION' THEN 'INSPECTION' END)::"PlanItemKey";
DELETE FROM "CarMaintenanceSetting" WHERE "item" IS NULL;
DROP INDEX "CarMaintenanceSetting_car_id_user_id_profile_id_category_key";
ALTER TABLE "CarMaintenanceSetting" DROP COLUMN "category";
ALTER TABLE "CarMaintenanceSetting" ALTER COLUMN "item" SET NOT NULL;
CREATE UNIQUE INDEX "CarMaintenanceSetting_car_id_user_id_profile_id_item_key" ON "CarMaintenanceSetting"("car_id","user_id","profile_id","item");

COMMIT;

-- reminder keys (replay on test/prod after the schema step; INSPECTION needs no change)
BEGIN;
UPDATE "MaintenanceReminderSent" SET key = regexp_replace(key, '^plan:OIL_CHANGE:', 'plan:ENGINE_OIL:') WHERE key LIKE 'plan:OIL_CHANGE:%';
UPDATE "MaintenanceReminderSent" SET key = regexp_replace(key, '^plan:TRANSMISSION_SERVICE:', 'plan:GEARBOX_OIL:') WHERE key LIKE 'plan:TRANSMISSION_SERVICE:%';
UPDATE "MaintenanceReminderSent" SET key = regexp_replace(key, '^plan:TIRE_SERVICE:', 'plan:TIRES:') WHERE key LIKE 'plan:TIRE_SERVICE:%';
UPDATE "ReminderSnooze" SET item_key = regexp_replace(item_key, '^OIL_CHANGE:', 'ENGINE_OIL:') WHERE kind = 'MAINTENANCE_PLAN' AND item_key LIKE 'OIL_CHANGE:%';
UPDATE "ReminderSnooze" SET item_key = regexp_replace(item_key, '^TRANSMISSION_SERVICE:', 'GEARBOX_OIL:') WHERE kind = 'MAINTENANCE_PLAN' AND item_key LIKE 'TRANSMISSION_SERVICE:%';
UPDATE "ReminderSnooze" SET item_key = regexp_replace(item_key, '^TIRE_SERVICE:', 'TIRES:') WHERE kind = 'MAINTENANCE_PLAN' AND item_key LIKE 'TIRE_SERVICE:%';
UPDATE "CarDeadlineOrder" SET item_keys = array_replace(array_replace(array_replace(item_keys, 'plan:OIL_CHANGE', 'plan:ENGINE_OIL'), 'plan:TRANSMISSION_SERVICE', 'plan:GEARBOX_OIL'), 'plan:TIRE_SERVICE', 'plan:TIRES');
COMMIT;

-- work items (BRAKE_PARTS, BATTERY, LIGHTS, SUSPENSION, ENGINE_REPAIR: no interval, history-only backfill)
-- Run AFTER the schema step added the enum values.
BEGIN;
INSERT INTO "MaintenanceRecordPlanItem" (maintenance_record_id, item)
SELECT r.id, (CASE r.service_category::text
  WHEN 'BATTERY_SERVICE' THEN 'BATTERY'
  WHEN 'LIGHT_SERVICE' THEN 'LIGHTS'
  WHEN 'ENGINE_SERVICE' THEN 'ENGINE_REPAIR'
  WHEN 'BRAKE_SERVICE' THEN 'BRAKE_PARTS' END)::"PlanItemKey"
FROM "MaintenanceRecord" r
WHERE r.service_category::text IN ('BATTERY_SERVICE','LIGHT_SERVICE','ENGINE_SERVICE','BRAKE_SERVICE')
  AND NOT EXISTS (SELECT 1 FROM "MaintenanceRecordPlanItem" j WHERE j.maintenance_record_id = r.id)
ON CONFLICT DO NOTHING;
COMMIT;

-- synthetic oil records
-- (a) the "last oil change" baseline records createCar writes (cost 0, OIL_CHANGE, created with the car)
--     must carry the ENGINE_OIL junction row. Dev: 3 found, 3 already linked, 0 missing.
-- (b) cars that have Car.last_oil_service_* but no ENGINE_OIL-linked record at all (created before
--     createCar mirrored the baseline) get the same synthetic record. Dev: 1 car (id 152), NOT yet applied.
BEGIN;
INSERT INTO "MaintenanceRecordPlanItem" (maintenance_record_id, item)
SELECT r.id, 'ENGINE_OIL'::"PlanItemKey"
FROM "MaintenanceRecord" r JOIN "Car" c ON c.id = r.car_id
WHERE r.cost = 0 AND r.service_category = 'OIL_CHANGE' AND r.description = ''
  AND abs(extract(epoch FROM (r.created_at - c.created_at))) < 5
  AND NOT EXISTS (SELECT 1 FROM "MaintenanceRecordPlanItem" j WHERE j.maintenance_record_id = r.id AND j.item = 'ENGINE_OIL')
ON CONFLICT DO NOTHING;

WITH missing AS (
  SELECT c.id AS car_id, COALESCE(c.last_oil_service_date, now()) AS d, c.last_oil_service_mileage AS m
  FROM "Car" c
  WHERE (c.last_oil_service_date IS NOT NULL OR c.last_oil_service_mileage IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM "MaintenanceRecord" r JOIN "MaintenanceRecordPlanItem" j
                    ON j.maintenance_record_id = r.id AND j.item = 'ENGINE_OIL' WHERE r.car_id = c.id)
), ins AS (
  INSERT INTO "MaintenanceRecord" (car_id, service_date, mileage, description, service_type, service_category, cost)
  SELECT car_id, d, m, '', 'MAINTENANCE', 'OIL_CHANGE', 0 FROM missing RETURNING id
)
INSERT INTO "MaintenanceRecordPlanItem" (maintenance_record_id, item) SELECT id, 'ENGINE_OIL'::"PlanItemKey" FROM ins;
COMMIT;

-- 2026-10-22 (follow-up): the schema step (npm run db:push:dev) also adds the PlanItemKey values
-- BODYWORK and ELECTRICAL (work items, no interval) and MaintenanceRecord.custom_items TEXT[] DEFAULT '{}'.
-- No data backfill.

-- 2026-10-22 (parts currency): the schema step (npm run db:push:dev) also adds MaintenancePart.currency TEXT NULL
-- (null = record currency), MaintenanceRecord.parts_cost DOUBLE PRECISION NULL and MaintenanceRecord.parts_cost_currency TEXT NULL
-- (both null = automatic parts sum). Additive, no data backfill.
