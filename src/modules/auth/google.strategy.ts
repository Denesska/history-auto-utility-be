import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { User } from '@prisma/client';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: `${configService.get<string>('API_BASE_URL')}/api/auth/google/redirect`,
      scope: ['email', 'profile', 'openid'],
      // NOTE: `accessType`/`prompt` are not valid `StrategyOptions` fields (they only
      // apply to the per-request `AuthenticateOptionsGoogle`, e.g. via a guard's
      // `getAuthenticateOptions()`) — passport-google-oauth20 has never read them from
      // here, so dropping them from this constructor call changes no runtime behavior.
      // The stricter @types/passport-google-oauth20 types (bumped as part of this
      // dependency upgrade) now catch this at compile time; flagged for the team to
      // decide separately whether `access_type=offline`/`prompt=consent` should be
      // wired through `GoogleAuthGuard.getAuthenticateOptions()` instead.
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id: googleId, name, emails, photos } = profile;
    const email = emails[0].value;

    let user: User = await this.prisma.user.findUnique({
      where: { google_id: googleId },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          google_id: googleId,
          email,
          first_name: name.givenName,
          last_name: name.familyName,
          picture: photos[0].value,
          refresh_token: refreshToken,
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { google_id: googleId },
        data: {
          email,
          first_name: name.givenName,
          last_name: name.familyName,
          picture: photos[0].value,
          refresh_token: refreshToken,
        },
      });
    }
    done(null, user);
  }
}
