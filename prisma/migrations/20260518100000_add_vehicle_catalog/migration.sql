-- CreateTable
CREATE TABLE "car_makes" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "external_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_makes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_models" (
    "id" SERIAL NOT NULL,
    "make_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "external_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_model_years" (
    "id" SERIAL NOT NULL,
    "model_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "car_model_years_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "car_makes_normalized_name_key" ON "car_makes"("normalized_name");

-- CreateIndex
CREATE INDEX "car_makes_normalized_name_idx" ON "car_makes"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "car_models_make_id_normalized_name_key" ON "car_models"("make_id", "normalized_name");

-- CreateIndex
CREATE INDEX "car_models_make_id_normalized_name_idx" ON "car_models"("make_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "car_model_years_model_id_year_key" ON "car_model_years"("model_id", "year");

-- CreateIndex
CREATE INDEX "car_model_years_model_id_idx" ON "car_model_years"("model_id");

-- AddForeignKey
ALTER TABLE "car_models" ADD CONSTRAINT "car_models_make_id_fkey" FOREIGN KEY ("make_id") REFERENCES "car_makes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_model_years" ADD CONSTRAINT "car_model_years_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "car_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
