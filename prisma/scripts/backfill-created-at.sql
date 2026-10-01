-- One-off backfill for the created_at columns added to "Car", "Document" and
-- "MaintenanceRecord" (admin stats page, 2026-09-27). Adding the column with
-- DEFAULT now() stamps every pre-existing row with the migration time, which
-- would show the whole history as "created today" on the growth charts.
--
-- Best-effort estimate for rows that existed before the column did:
--   Document / MaintenanceRecord → earliest attached upload, else the owner's
--                                  signup date.
--   Car → earliest timestamp of anything attached to it, never earlier than
--         the owner's signup date.
-- Only touches rows whose created_at is >= :cutoff (i.e. the ones stamped by
-- the migration). Run once per database, right after `prisma db push`:
--   psql ... -v cutoff="'2026-09-27'" -f prisma/scripts/backfill-created-at.sql

BEGIN;

UPDATE "Document" d
SET created_at = COALESCE(
  (SELECT MIN(u.created_at) FROM uploaded_files u
    WHERE u.context_type = 'document' AND u.context_id = d.id),
  (SELECT usr.created_at FROM "Car" c JOIN "User" usr ON usr.id = c.user_id WHERE c.id = d.car_id)
)
WHERE d.created_at >= :cutoff::timestamp;

UPDATE "MaintenanceRecord" m
SET created_at = COALESCE(
  (SELECT MIN(u.created_at) FROM uploaded_files u
    WHERE u.context_type = 'maintenance' AND u.context_id = m.id),
  (SELECT usr.created_at FROM "Car" c JOIN "User" usr ON usr.id = c.user_id WHERE c.id = m.car_id)
)
WHERE m.created_at >= :cutoff::timestamp;

UPDATE "Car" c
SET created_at = GREATEST(
  usr.created_at,
  LEAST(
    COALESCE((SELECT MIN(created_at) FROM "Document" WHERE car_id = c.id), 'infinity'),
    COALESCE((SELECT MIN(created_at) FROM "MaintenanceRecord" WHERE car_id = c.id), 'infinity'),
    COALESCE((SELECT MIN(created_at) FROM "CarNote" WHERE car_id = c.id), 'infinity'),
    COALESCE((SELECT MIN(created_at) FROM "CarWish" WHERE car_id = c.id), 'infinity'),
    COALESCE((SELECT MIN(created_at) FROM "CarUserAccess" WHERE car_id = c.id), 'infinity'),
    COALESCE((SELECT MIN(created_at) FROM "CarDeadlineOrder" WHERE car_id = c.id), 'infinity'),
    COALESCE((SELECT MIN(created_at) FROM "CarMaintenanceSetting" WHERE car_id = c.id), 'infinity'),
    usr.created_at + interval '100 years'
  )
)
FROM "User" usr
WHERE usr.id = c.user_id AND c.created_at >= :cutoff::timestamp;

-- Cars with nothing attached fell through to the +100y sentinel → owner signup.
UPDATE "Car" c SET created_at = usr.created_at
FROM "User" usr
WHERE usr.id = c.user_id AND c.created_at > now();

COMMIT;
