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
      accessType: 'offline',
      prompt: 'consent',
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
