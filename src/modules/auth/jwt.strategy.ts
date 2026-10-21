import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtUserPayload } from './dto/jwt-payload.dto';
import { parseSessionContext } from '../../common/context/session-context';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => req?.['cookies']?.access_token || null,
      ]),
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: any): Promise<JwtUserPayload> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { google_id: payload.sub },
      select: {
        id: true,
        disabled_at: true,
        must_change_password: true,
        is_company_managed: true,
        // Loaded here (not a separate query) so LegalEnforcementInterceptor and
        // AuthController.getProfile (`/auth/me`) can read them straight off
        // req.user — see ACCOUNT-CONTEXT.md-style reasoning in that interceptor.
        terms_accepted_version: true,
        privacy_accepted_version: true,
        legal_accepted_at: true,
      },
    });

    // disabled_at is set when a company removes one of its own managed
    // accounts (see OrganizationService.removeMember) — a still-valid access
    // token issued before that must stop working immediately, not just on
    // its next refresh.
    if (!user || user.disabled_at) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      google_id: payload.sub,
      email: payload.email,
      must_change_password: user.must_change_password,
      is_company_managed: user.is_company_managed,
      terms_accepted_version: user.terms_accepted_version,
      privacy_accepted_version: user.privacy_accepted_version,
      legal_accepted_at: user.legal_accepted_at,
      ctx: parseSessionContext(payload.ctx),
    };
  }
}
