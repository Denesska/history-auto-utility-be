import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NavLinkResolver } from './nav-link.resolver';
import { NavRelayService } from './nav-relay.service';

describe('NavRelayService history', () => {
  const slug = '0123456789abcdef';
  const row = (id: number, name: string | null = `Place ${id}`) => ({
    id,
    slug,
    name,
    lat: 45.5,
    lon: 25.5,
    raw_url: `https://maps.example/${id}`,
    created_at: new Date(1_720_000_000_000 + id * 1000),
  });

  let prisma: {
    navDestination: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
  };
  let service: NavRelayService;

  beforeEach(() => {
    prisma = {
      navDestination: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    service = new NavRelayService(
      prisma as unknown as PrismaService,
      {} as NavLinkResolver,
    );
  });

  it('returns at most 100 rows from this channel, newest first', async () => {
    prisma.navDestination.findMany.mockResolvedValue([row(9), row(8), row(7)]);

    const result = await service.history(slug);

    expect(prisma.navDestination.findMany).toHaveBeenCalledWith({
      where: { slug },
      orderBy: { id: 'desc' },
      take: 100,
    });
    expect(result.items.map((item) => item.id)).toEqual([9, 8, 7]);
  });

  it('returns an empty item list when the channel has no history', async () => {
    prisma.navDestination.findMany.mockResolvedValue([]);

    await expect(service.history(slug)).resolves.toEqual({ items: [] });
    expect(prisma.navDestination.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug } }),
    );
  });

  it('rejects an invalid channel for history before querying the database', async () => {
    await expect(service.history('short')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.navDestination.findMany).not.toHaveBeenCalled();
  });

  it('resends a saved destination as a new event without resolving its URL', async () => {
    const previous = row(4, 'Old Town');
    const resent = row(21, 'Old Town');
    prisma.navDestination.findFirst.mockResolvedValue(previous);
    prisma.navDestination.create.mockResolvedValue(resent);

    const result = await service.resend(slug, 4);

    expect(prisma.navDestination.findFirst).toHaveBeenCalledWith({
      where: { id: 4, slug },
    });
    expect(prisma.navDestination.create).toHaveBeenCalledWith({
      data: {
        slug,
        name: 'Old Town',
        lat: 45.5,
        lon: 25.5,
        raw_url: 'https://maps.example/4',
      },
    });
    expect(result.id).toBe(21);
    expect(result).not.toHaveProperty('raw_url');
  });

  it('returns 404 when the destination does not belong to this channel', async () => {
    prisma.navDestination.findFirst.mockResolvedValue(null);

    await expect(service.resend(slug, 4)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.navDestination.findFirst).toHaveBeenCalledWith({
      where: { id: 4, slug },
    });
    expect(prisma.navDestination.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid channel for resend before querying the database', async () => {
    await expect(service.resend('short', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.navDestination.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'NaN', id: Number.NaN },
    { label: 'fractional', id: 1.5 },
    { label: 'infinite', id: Number.POSITIVE_INFINITY },
    { label: 'negative', id: -1 },
    { label: 'zero', id: 0 },
    { label: 'above the database Int range', id: 2_147_483_648 },
    { label: 'unsafe integer', id: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects $label destination ids before querying the database', async ({ id }) => {
    await expect(service.resend(slug, id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.navDestination.findFirst).not.toHaveBeenCalled();
  });
});
