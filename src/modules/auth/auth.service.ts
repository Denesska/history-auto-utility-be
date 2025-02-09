import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';
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
    } catch (error) {
      return false;
    }
  }

  async removeRefreshToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { google_id: userId },
      data: { refresh_token: null },
    });
  }

  validateAndDecodeToken(accessToken: string): JwtUserPayload {
    try {
      // Validate and decode the token
      const decoded = jwt.decode(accessToken);

      if (!decoded.sub) {
        throw new UnauthorizedException('Token is invalid: userId not found');
      }

      return { google_id: decoded.sub as string, email: decoded['email'] };
    } catch (error) {
      console.error('Token validation failed:', error.message);
      throw new UnauthorizedException('Invalid token');
    }
  }

  /*generateJwtToken(user: Partial<User>): string {
    const payload = {
      id: user.id,
      google_id: user.google_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    };
    return this.jwtService.sign(payload, {
      expiresIn: '30s',
    });
  }

  // Generate Refresh Token
  generateRefreshToken(userId: string): string {
    const payload = { sub: userId };
    return this.jwtService.sign(payload, {
      expiresIn: '7d', // Refresh Token valid for 7 days
    });
  }

  // Save Refresh Token in the database
  async saveRefreshToken(userId: string, refreshToken: string): Promise<void> {
    await this.prisma.user.update({
      where: { google_id: userId },
      data: { refresh_token: refreshToken },
    });
  }

  /!**
   * Validate and decode a Bearer token.
   * @param bearerToken - The full Authorization header (e.g., "Bearer <token>").
   * @returns The user ID extracted from the token.
   * @throws UnauthorizedException if the token is invalid or not provided.
   *!/
  validateAndDecodeToken(bearerToken: string): string {
    if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid or missing Authorization header');
    }

    // Extract the actual token from the header
    const token = bearerToken.split(' ')[1];

    try {
      // Validate and decode the token
      const userId = jwt.decode(token)['google_id'];

      if (!userId) {
        throw new UnauthorizedException('Token is invalid: userId not found');
      }

      return <string>userId;
    } catch (error) {
      console.error('Token validation failed:', error.message);
      throw new UnauthorizedException('Invalid token');
    }
  }

  /!**
   * Find a user's refresh token by user ID.
   * @param userId - The ID of the user.
   * @returns The refresh token if found, or throws a NotFoundException.
   *!/
  async getRefreshTokenByUserId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { google_id: userId },
      select: { refresh_token: true }, // Only fetch the refresh_token field
    });

    if (!user || !user.refresh_token) {
      throw new NotFoundException(`Refresh token not found for user with ID: ${userId}`);
    }

    return user.refresh_token;
  }

  /!**
   * Validate and refresh tokens.
   * @param refreshToken The refresh token to validate.
   * @returns New access and refresh tokens.
   *!/
  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; newRefreshToken: string }> {
    try {
      // Verify the refresh token's validity
      const decoded = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      // Check if the refresh token matches the one stored in the database
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
      });

      if (!user || user.refresh_token !== refreshToken) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // Generate new access and refresh tokens
      const accessToken = this.generateJwtToken(user);
      const newRefreshToken = this.generateRefreshToken(user.google_id);

      // Save the new refresh token in the database
      await this.saveRefreshToken(user.google_id, newRefreshToken);

      return { accessToken, newRefreshToken };
    } catch (error) {
      console.error('Error validating refresh token:', error.message);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }*/
}
