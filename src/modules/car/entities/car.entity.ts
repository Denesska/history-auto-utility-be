import {Car} from "@prisma/client";

export class CarEntity implements Car {
    id: number;
    user_id: number;
    vin: string;
    make: string;
    model: string;
    year: number;
    license_plate: string;
    current_mileage: number;
}