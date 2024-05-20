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
        private prisma: PrismaService
    ) {
        super({
            clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
            clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
            callbackURL: 'http://localhost:3000/auth/google/redirect',
            scope: ['email', 'profile'],
        });
    }

    async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback): Promise<any> {
        const { name, emails, photos } = profile;
        const email = emails[0].value;

        let user: User = await this.prisma.user.findUnique({
            where: { email },
            include: { cars: true }
        });

        if (!user) {
            user = await this.prisma.user.create({
                data: {
                    email,
                    first_name: name.givenName,
                    last_name: name.familyName,
                    picture: photos[0].value,
                },
            });
        }

        const payload = {
            user,
            accessToken,
        };

        done(null, payload);
    }
}
