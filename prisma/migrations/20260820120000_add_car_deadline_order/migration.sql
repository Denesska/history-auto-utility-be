-- CreateTable
CREATE TABLE "CarDeadlineOrder" (
    "id" SERIAL NOT NULL,
    "car_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "item_keys" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarDeadlineOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CarDeadlineOrder_car_id_user_id_key" ON "CarDeadlineOrder"("car_id", "user_id");

-- AddForeignKey
ALTER TABLE "CarDeadlineOrder" ADD CONSTRAINT "CarDeadlineOrder_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarDeadlineOrder" ADD CONSTRAINT "CarDeadlineOrder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
