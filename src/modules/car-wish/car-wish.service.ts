import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCarWishDto } from './dto/create-car-wish.dto';
import { UpdateCarWishDto } from './dto/update-car-wish.dto';
import { CarWishDto } from './dto/car-wish.dto';
import { CarWishlistDto } from './dto/car-wishlist.dto';
import { CarWishStatus } from '@prisma/client';

@Injectable()
export class CarWishService {
    constructor(private prisma: PrismaService) {}

    async getWishlist(carId: number): Promise<CarWishlistDto> {
        const [car, items] = await Promise.all([
            this.prisma.car.findUnique({ where: { id: carId }, select: { wishlist_budget: true } }),
            this.prisma.carWish.findMany({
                where: { car_id: carId },
                // Same ordering the client renders in, so the cumulative totals it
                // computes line up with `position` without a client-side sort.
                orderBy: [{ position: 'asc' }, { id: 'asc' }],
            }),
        ]);
        if (!car) throw new NotFoundException(`Car ${carId} not found`);

        return { budget: car.wishlist_budget, items };
    }

    async createWish(data: CreateCarWishDto): Promise<CarWishDto> {
        // New wishes land at the bottom of the list — the user promotes them by
        // dragging, which is the whole point of the ordering being manual.
        const last = await this.prisma.carWish.findFirst({
            where: { car_id: data.car_id },
            orderBy: { position: 'desc' },
            select: { position: true },
        });

        return this.prisma.carWish.create({
            data: {
                car_id: data.car_id,
                title: data.title,
                notes: data.notes ?? null,
                estimated_cost: data.estimated_cost ?? null,
                service_type: data.service_type ?? null,
                position: (last?.position ?? -1) + 1,
            },
        });
    }

    async updateWish(id: number, data: UpdateCarWishDto): Promise<CarWishDto> {
        const statusChanged = data.status !== undefined;

        return this.prisma.carWish.update({
            where: { id },
            data: {
                ...(data.title !== undefined && { title: data.title }),
                ...(data.notes !== undefined && { notes: data.notes }),
                ...(data.estimated_cost !== undefined && { estimated_cost: data.estimated_cost }),
                ...(data.service_type !== undefined && { service_type: data.service_type }),
                ...(statusChanged && {
                    status: data.status,
                    // done_at is derived from the status rather than sent by the
                    // client, so re-activating a wish clears it automatically.
                    done_at: data.status === CarWishStatus.DONE ? new Date() : null,
                }),
            },
        });
    }

    async deleteWish(id: number): Promise<CarWishDto> {
        return this.prisma.carWish.delete({ where: { id } });
    }

    async reorderWishes(carId: number, ids: number[]): Promise<CarWishDto[]> {
        // Scoped to the car so a crafted id list can't reposition another car's
        // wishes; ids that don't belong here simply update nothing.
        await this.prisma.$transaction(
            ids.map((id, index) =>
                this.prisma.carWish.updateMany({
                    where: { id, car_id: carId },
                    data: { position: index },
                }),
            ),
        );

        return this.prisma.carWish.findMany({
            where: { car_id: carId },
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
        });
    }

    async setBudget(carId: number, budget: number | null): Promise<CarWishlistDto> {
        await this.prisma.car.update({
            where: { id: carId },
            data: { wishlist_budget: budget },
        });

        return this.getWishlist(carId);
    }
}
