-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('PETROL', 'DIESEL', 'HYBRID', 'PLUGIN_HYBRID', 'ELECTRIC', 'LPG');

-- CreateEnum
CREATE TYPE "TransmissionType" AS ENUM ('MANUAL', 'AUTOMATIC', 'SEMI_AUTOMATIC');

-- AlterTable: make vin nullable, remove image, add new vehicle fields
ALTER TABLE "Car"
  ALTER COLUMN "vin" DROP NOT NULL,
  DROP COLUMN IF EXISTS "image",
  ADD COLUMN "variant"                  TEXT,
  ADD COLUMN "fuel_type"                "FuelType",
  ADD COLUMN "transmission"             "TransmissionType",
  ADD COLUMN "engine"                   TEXT,
  ADD COLUMN "color"                    TEXT,
  ADD COLUMN "ownership_start_date"     TIMESTAMP(3),
  ADD COLUMN "rca_expiry_date"          TIMESTAMP(3),
  ADD COLUMN "itp_expiry_date"          TIMESTAMP(3),
  ADD COLUMN "rov_expiry_date"          TIMESTAMP(3),
  ADD COLUMN "last_oil_service_date"    TIMESTAMP(3),
  ADD COLUMN "last_oil_service_mileage" INTEGER;

-- CreateTable
CREATE TABLE "CarPhoto" (
    "id"     SERIAL NOT NULL,
    "car_id" INTEGER NOT NULL,
    "url"    TEXT NOT NULL,
    CONSTRAINT "CarPhoto_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CarPhoto" ADD CONSTRAINT "CarPhoto_car_id_fkey"
  FOREIGN KEY ("car_id") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;
