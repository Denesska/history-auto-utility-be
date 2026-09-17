import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PutProfileDto } from './dto/put-profile.dto';
import { CockpitProfileDto } from './dto/cockpit-profile.dto';

// The slug stands in for authentication, exactly as in NavRelayService — long enough not to be
// guessed or scanned. Use a different one from the relay's: this channel carries the user's saved
// places, which is more than a relay slug is trusted with.
const MIN_SLUG_LENGTH = 16;

// A profile is a few kilobytes of settings and a list of favourites. A megabyte is already far more
// than anything legitimate, and the cap is what keeps an unauthenticated endpoint from being a
// convenient place to park a large file.
const MAX_PAYLOAD_BYTES = 256 * 1024;

/**
 * One stored profile per channel, last writer wins by revision.
 *
 * The server does not know or care what a "setting" is: it stores the document the car sends and
 * hands it back unchanged. The only rule it enforces is that the revision never goes backwards, so
 * a head unit that has fallen behind (a fresh install starts at revision 0) cannot overwrite a good
 * profile with an old or empty one. The car pulls before it pushes for the same reason.
 */
@Injectable()
export class CockpitProfileService {
  private readonly logger = new Logger(CockpitProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The stored profile for [slug], or `{}` when nothing has been saved on this channel yet. */
  async get(slug: string): Promise<CockpitProfileDto> {
    this.assertSlug(slug);
    const row = await this.prisma.cockpitProfile.findUnique({ where: { slug } });
    return row ? (row.payload as CockpitProfileDto) : {};
  }

  /** Stores [body] as the profile for [slug]. Rejects a revision older than the stored one. */
  async put(slug: string, body: PutProfileDto): Promise<CockpitProfileDto> {
    this.assertSlug(slug);

    const payload = body as unknown as Prisma.InputJsonValue;
    const size = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (size > MAX_PAYLOAD_BYTES) {
      throw new BadRequestException('Profile too large');
    }

    const existing = await this.prisma.cockpitProfile.findUnique({ where: { slug } });
    if (existing && body.revision < existing.revision) {
      // Not an error on the car's part — it means another device got there first. The car answers
      // a rejected push by pulling, which is how it catches up.
      throw new ConflictException(
        `Stored profile is newer (revision ${existing.revision} > ${body.revision})`,
      );
    }

    const row = await this.prisma.cockpitProfile.upsert({
      where: { slug },
      create: { slug, revision: body.revision, payload },
      update: { revision: body.revision, payload },
    });
    this.logger.log(`profile ${slug.slice(0, 4)}… saved at revision ${row.revision}`);
    return row.payload as CockpitProfileDto;
  }

  private assertSlug(slug: string): void {
    if (!slug || slug.length < MIN_SLUG_LENGTH) {
      throw new BadRequestException('Invalid channel');
    }
  }
}
