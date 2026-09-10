import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CarAccessService } from './car-access.service';

describe('CarAccessService.leaveAccess', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    car: { findUnique: jest.fn() },
    carUserAccess: { findUnique: jest.fn(), delete: jest.fn() },
  };
  const service = new CarAccessService(prisma as any, {} as any, {} as any, {} as any);

  beforeEach(() => jest.clearAllMocks());

  it('removes the current user access record from a shared car', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7 });
    prisma.car.findUnique.mockResolvedValue({ id: 42, user_id: 1 });
    prisma.carUserAccess.findUnique.mockResolvedValue({ id: 99, car_id: 42, user_id: 7 });
    prisma.carUserAccess.delete.mockResolvedValue({});

    await service.leaveAccess(42, 'google-user-id');

    expect(prisma.carUserAccess.delete).toHaveBeenCalledWith({
      where: { car_id_user_id: { car_id: 42, user_id: 7 } },
    });
  });

  it('does not allow the owner to leave their own car', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7 });
    prisma.car.findUnique.mockResolvedValue({ id: 42, user_id: 7 });

    await expect(service.leaveAccess(42, 'google-user-id')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.carUserAccess.delete).not.toHaveBeenCalled();
  });

  it('returns not found when the user has no access record', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7 });
    prisma.car.findUnique.mockResolvedValue({ id: 42, user_id: 1 });
    prisma.carUserAccess.findUnique.mockResolvedValue(null);

    await expect(service.leaveAccess(42, 'google-user-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.carUserAccess.delete).not.toHaveBeenCalled();
  });
});
