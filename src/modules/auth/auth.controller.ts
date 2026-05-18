import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly cookieConfig: any;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.cookieConfig = {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      domain: this.configService.get<string>('COOKIE_DOMAIN', 'api.denhau.ro'),
      maxAge: 24 * 60 * 60 * 1000,
    };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  async login(): Promise<void> {
    // Passport redirects to Google — this handler never executes
  }

  @Get('google/redirect')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  @ApiResponse({ status: 302, description: 'Authenticated and redirected to frontend.' })
  @ApiResponse({ status: 401, description: 'Google authentication failed.' })
  async googleAuthRedirect(@Req() req, @Res() res: Response): Promise<void> {
    const user = req.user;

    res.clearCookie('access_token', this.cookieConfig);

    const accessToken = this.authService.generateAccessToken(user);
    const refreshToken = this.authService.generateRefreshToken(user.google_id);

    await this.authService.saveRefreshToken(user.google_id, refreshToken);

    res.cookie('access_token', accessToken, this.cookieConfig);

    const feBaseUrl = this.configService.get<string>('FE_BASE_URL', 'http://localhost:4200');
    res.redirect(`${feBaseUrl}/main/cars`);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'New access token issued.' })
  @ApiResponse({ status: 401, description: 'Refresh token missing or invalid.' })
  async refreshAccessToken(@Req() req, @Res() res: Response): Promise<void> {
    const access_token = req.cookies?.access_token;

    if (!access_token) {
      throw new UnauthorizedException('Access token missing');
    }

    const user = this.authService.decodeVerifiedToken(access_token);

    const refreshToken = await this.authService.getRefreshTokenByUserId(user.google_id);

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    if (!this.authService.validateRefreshToken(refreshToken)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newAccessToken = this.authService.generateAccessToken(user);
    res.cookie('access_token', newAccessToken, this.cookieConfig);
    res.status(200).json({ message: 'Token refreshed successfully' });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get authenticated user profile' })
  @ApiResponse({ status: 200, description: 'User profile returned.' })
  @ApiResponse({ status: 401, description: 'Invalid or missing access token.' })
  async getProfile(@Req() req): Promise<any> {
    return req.user;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout user and invalidate tokens' })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  async logout(@Req() req, @Res() res: Response): Promise<void> {
    const googleId = req.user?.google_id;

    if (!googleId) {
      throw new UnauthorizedException('User is not authenticated');
    }

    await this.authService.removeRefreshToken(googleId);

    res.clearCookie('access_token', { ...this.cookieConfig, maxAge: 0 });
    res.status(200).json({ message: 'Logout successful' });
  }
}
