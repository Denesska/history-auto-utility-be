import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NavLinkResolver } from './nav-link.resolver';
import { NavDestinationDto } from './dto/nav-destination.dto';

// The slug stands in for authentication, so it must be long enough not to be guessed or scanned.
const MIN_SLUG_LENGTH = 16;

@Injectable()
export class NavRelayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: NavLinkResolver,
  ) {}

  /** Resolves a shared Google Maps link and stores it as the newest destination on [slug].
   *  Rejects a share we could turn into neither coordinates nor a place name — nothing the car
   *  could act on — rather than storing a dead row. */
  async set(slug: string, url: string): Promise<NavDestinationDto> {
    this.assertSlug(slug);
    const resolved = await this.resolver.resolve(url);
    if (resolved.lat === null && resolved.name === null) {
      throw new BadRequestException(
        'Could not extract a location or place name from the shared link',
      );
    }
    const row = await this.prisma.navDestination.create({
      data: {
        slug,
        name: resolved.name,
        lat: resolved.lat,
        lon: resolved.lon,
        raw_url: resolved.url,
      },
    });
    return this.toDto(row);
  }

  /** The newest destination on [slug], or an empty object when nothing has been shared yet. */
  async latest(slug: string): Promise<NavDestinationDto> {
    this.assertSlug(slug);
    const row = await this.prisma.navDestination.findFirst({
      where: { slug },
      orderBy: { id: 'desc' },
    });
    return row ? this.toDto(row) : {};
  }

  private assertSlug(slug: string): void {
    if (!slug || slug.length < MIN_SLUG_LENGTH) {
      throw new BadRequestException('Invalid channel');
    }
  }

  private toDto(row: {
    id: number;
    name: string | null;
    lat: number | null;
    lon: number | null;
    created_at: Date;
  }): NavDestinationDto {
    return {
      id: row.id,
      name: row.name,
      lat: row.lat,
      lon: row.lon,
      ts: Math.floor(row.created_at.getTime() / 1000),
    };
  }
}
