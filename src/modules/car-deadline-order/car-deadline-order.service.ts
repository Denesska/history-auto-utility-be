import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeadlineOrderDto } from './dto/deadline-order.dto';

@Injectable()
export class CarDeadlineOrderService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrder(carId: number, userId: number): Promise<DeadlineOrderDto> {
    await this.assertCanSeeCar(carId, userId);

    const row = await this.prisma.carDeadlineOrder.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: userId } },
    });

    return { car_id: carId, order: row?.item_keys ?? [], dismissed: row?.dismissed_keys ?? [] };
  }

  async setOrder(carId: number, userId: number, order: string[]): Promise<DeadlineOrderDto> {
    await this.assertCanSeeCar(carId, userId);

    const existing = await this.prisma.carDeadlineOrder.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: userId } },
    });
    const dismissed = existing?.dismissed_keys ?? [];

    // An empty order with nothing dismissed means "no preferences at all" — delete
    // the row rather than storing empty arrays, so a reset leaves no stale state.
    if (!order.length && !dismissed.length) {
      await this.prisma.carDeadlineOrder.deleteMany({ where: { car_id: carId, user_id: userId } });
      return { car_id: carId, order: [], dismissed: [] };
    }

    // Duplicate keys would make the client's ordering ambiguous.
    const deduped = [...new Set(order)];

    const row = await this.prisma.carDeadlineOrder.upsert({
      where: { car_id_user_id: { car_id: carId, user_id: userId } },
      create: { car_id: carId, user_id: userId, item_keys: deduped },
      update: { item_keys: deduped },
    });

    return { car_id: carId, order: row.item_keys, dismissed: row.dismissed_keys };
  }

  async setDismissed(carId: number, userId: number, dismissed: string[]): Promise<DeadlineOrderDto> {
    await this.assertCanSeeCar(carId, userId);

    const existing = await this.prisma.carDeadlineOrder.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: userId } },
    });
    const order = existing?.item_keys ?? [];

    if (!dismissed.length && !order.length) {
      await this.prisma.carDeadlineOrder.deleteMany({ where: { car_id: carId, user_id: userId } });
      return { car_id: carId, order: [], dismissed: [] };
    }

    const deduped = [...new Set(dismissed)];

    const row = await this.prisma.carDeadlineOrder.upsert({
      where: { car_id_user_id: { car_id: carId, user_id: userId } },
      create: { car_id: carId, user_id: userId, item_keys: [], dismissed_keys: deduped },
      update: { dismissed_keys: deduped },
    });

    return { car_id: carId, order: row.item_keys, dismissed: row.dismissed_keys };
  }

  /**
   * The order is per user, so any level of access is enough to have one — but a
   * user with no access to the car must not be able to probe which cars exist.
   */
  private async assertCanSeeCar(carId: number, userId: number): Promise<void> {
    const car = await this.prisma.car.findUnique({
      where: { id: carId },
      select: { user_id: true },
    });
    if (!car) throw new NotFoundException('Car not found');
    if (car.user_id === userId) return;

    const access = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: userId } },
      select: { accepted_at: true },
    });
    if (!access?.accepted_at) throw new ForbiddenException('No access to this car');
  }
}
