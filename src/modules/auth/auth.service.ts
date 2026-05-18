import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtUserPayload } from './dto/jwt-payload.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  generateAccessToken(user: JwtUserPayload): string {
    return this.jwtService.sign(
      { sub: user.google_id, email: user.email },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
    );
  }

  generateRefreshToken(userId: string): string {
    return this.jwtService.sign(
      { sub: userId },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d' },
    );
  }

  async saveRefreshToken(userId: string, refreshToken: string): Promise<void> {
    await this.prisma.user.update({
      where: { google_id: userId },
      data: { refresh_token: refreshToken },
    });
  }

  async getRefreshTokenByUserId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { google_id: userId },
      select: { refresh_token: true },
    });
    return user?.refresh_token || null;
  }

  validateRefreshToken(refreshToken: string): boolean {
    try {
      this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      return true;
    } catch {
      return false;
    }
  }

  async removeRefreshToken(googleId: string): Promise<void> {
    await this.prisma.user.update({
      where: { google_id: googleId },
      data: { refresh_token: null },
    });
  }

  // Verifies JWT signature but ignores expiration — safe to use on expired access tokens
  decodeVerifiedToken(accessToken: string): JwtUserPayload {
    try {
      const decoded = this.jwtService.verify(accessToken, {
        secret: process.env.JWT_ACCESS_SECRET,
        ignoreExpiration: true,
      });

      if (!decoded?.sub) {
        throw new UnauthorizedException('Token is invalid: userId not found');
      }

      return { google_id: decoded.sub as string, email: decoded['email'] };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
