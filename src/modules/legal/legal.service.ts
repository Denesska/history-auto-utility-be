import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AcceptLegalDto } from './dto/accept-legal.dto';
import { LegalStatusDto } from './dto/legal-status.dto';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from './legal-versions';

export interface LegalAcceptanceFields {
  terms_accepted_version: string | null;
  privacy_accepted_version: string | null;
  legal_accepted_at: Date | null;
}

@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Shared status-object builder — used by LegalController and
   * AuthController.getProfile (`/auth/me`'s `legal` field) so both read the
   * exact same shape off whatever's already loaded on req.user.
   */
  buildStatus(user: LegalAcceptanceFields): LegalStatusDto {
    return {
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
      acceptedTermsVersion: user.terms_accepted_version,
      acceptedPrivacyVersion: user.privacy_accepted_version,
      acceptedAt: user.legal_accepted_at ? user.legal_accepted_at.toISOString() : null,
      needsAcceptance: user.terms_accepted_version !== CURRENT_TERMS_VERSION || user.privacy_accepted_version !== CURRENT_PRIVACY_VERSION,
    };
  }

  async getStatus(userId: number): Promise<LegalStatusDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { terms_accepted_version: true, privacy_accepted_version: true, legal_accepted_at: true },
    });
    return this.buildStatus(user);
  }

  /**
   * Records acceptance: rejects with 409 LEGAL_VERSION_OUTDATED if the client
   * is accepting a version that's no longer current (e.g. stale page open in
   * another tab while the texts were bumped), otherwise updates the user's
   * stored versions and appends an immutable UserLegalConsent proof-of-consent
   * row in the same transaction.
   */
  async accept(userId: number, dto: AcceptLegalDto, ip: string | null, userAgent: string | null): Promise<LegalStatusDto> {
    if (dto.termsVersion !== CURRENT_TERMS_VERSION || dto.privacyVersion !== CURRENT_PRIVACY_VERSION) {
      throw new ConflictException({
        code: 'LEGAL_VERSION_OUTDATED',
        message: 'The terms/privacy version you accepted is no longer current — reload and accept again',
      });
    }

    const acceptedAt = new Date();
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          terms_accepted_version: dto.termsVersion,
          privacy_accepted_version: dto.privacyVersion,
          legal_accepted_at: acceptedAt,
        },
        select: { terms_accepted_version: true, privacy_accepted_version: true, legal_accepted_at: true },
      }),
      this.prisma.userLegalConsent.create({
        data: {
          user_id: userId,
          terms_version: dto.termsVersion,
          privacy_version: dto.privacyVersion,
          accepted_at: acceptedAt,
          ip,
          user_agent: userAgent?.slice(0, 500) ?? null,
        },
      }),
    ]);

    return this.buildStatus(user);
  }
}
