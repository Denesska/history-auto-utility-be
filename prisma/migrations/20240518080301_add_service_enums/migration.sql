/*
  Warnings:

  - Changed the type of `service_type` on the `MaintenanceRecord` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `service_category` on the `MaintenanceRecord` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('REPAIR', 'MAINTENANCE', 'IMPROVEMENT');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('OIL_CHANGE', 'BRAKE_SERVICE', 'TRANSMISSION_SERVICE', 'TIRE_SERVICE', 'OTHER');

-- AlterTable
ALTER TABLE "MaintenanceRecord" DROP COLUMN "service_type",
ADD COLUMN     "service_type" "ServiceType" NOT NULL,
DROP COLUMN "service_category",
ADD COLUMN     "service_category" "ServiceCategory" NOT NULL;
