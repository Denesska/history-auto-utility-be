import {
  Controller,
  Get,
  Logger,
  NotFoundException,
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
import { GoogleAuthGuard } from './google-auth.guard';
import {
  ALLOWED_LOGIN_ORIGINS,
  DEV_BYPASS_USER,
  isMobileLoginOrigin,
} from './auth.constants';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
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
  @UseGuards(GoogleAuthGuard)
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
    await this.issueSessionAndRedirect(req.user, req, res);
  }

  // Dev-only shortcut that skips Google entirely: logs in as a fixed
  // dev-bypass account so Claude/local tooling can reach authenticated
  // screens without a real Google login. Hard-gated so it can never exist
  // on test/prod, even if DEV_AUTH_BYPASS were mistakenly set there.
  @Get('dev-login')
  @ApiOperation({ summary: '[dev only] Log in as the dev-bypass user, no Google OAuth' })
  async devLogin(@Req() req, @Res() res: Response): Promise<void> {
    const isProdEnv = this.configService.get<string>('NODE_ENV') === 'production';
    const bypassEnabled = this.configService.get<string>('DEV_AUTH_BYPASS') === 'true';

    if (isProdEnv || !bypassEnabled) {
      throw new NotFoundException();
    }

    const user = await this.authService.upsertDevBypassUser();
    await this.issueSessionAndRedirect(user, req, res);
  }

  private async issueSessionAndRedirect(user: { google_id: string; email: string }, req, res: Response): Promise<void> {
    res.clearCookie('access_token', this.cookieConfig);

    const accessToken = this.authService.generateAccessToken(user);
    const refreshToken = this.authService.generateRefreshToken(user.google_id);

    await this.authService.saveRefreshToken(user.google_id, refreshToken);

    res.cookie('access_token', accessToken, this.cookieConfig);

    const defaultFeBaseUrl = this.configService.get<string>('FE_BASE_URL', 'http://localhost:4200');
    const loginOrigin = req.cookies?.login_origin as string | undefined;
    const feBaseUrl =
      loginOrigin && (ALLOWED_LOGIN_ORIGINS as readonly string[]).includes(loginOrigin)
        ? loginOrigin
        : defaultFeBaseUrl;

    res.clearCookie('login_origin', { path: '/' });

    if (isMobileLoginOrigin(loginOrigin)) {
      res.redirect(`${feBaseUrl}/auth/token?token=${encodeURIComponent(accessToken)}`);
      return;
    }

    res.redirect(`${feBaseUrl}/main/overview`);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'New access token issued.' })
  @ApiResponse({ status: 401, description: 'Refresh token missing or invalid.' })
  async refreshAccessToken(@Req() req, @Res() res: Response): Promise<void> {
    // Web clients carry the (possibly expired) access token via the httpOnly
    // cookie. Native clients have no cookie jar shared with the app's webview,
    // so they present it via the Authorization header instead.
    const hasCookie = !!req.cookies?.access_token;
    const bearerToken = this.extractBearerToken(req);
    const hasBearer = !!bearerToken;
    const access_token = req.cookies?.access_token || bearerToken;
    const origin = req.headers?.origin;
    const ua = req.headers?.['user-agent'];
    const instance = req.headers?.['x-client-instance'] || 'n/a';

    if (!access_token) {
      this.logger.warn(
        `refresh: no token present — cookie=${hasCookie} bearer=${hasBearer} instance=${instance} origin=${origin} ua=${ua}`,
      );
      throw new UnauthorizedException('Access token missing');
    }

    let user;
    try {
      user = this.authService.decodeVerifiedToken(access_token);
    } catch (e) {
      this.logger.warn(
        `refresh: token decode failed — cookie=${hasCookie} bearer=${hasBearer} instance=${instance} origin=${origin} err=${e?.message}`,
      );
      throw e;
    }

    const refreshToken = await this.authService.getRefreshTokenByUserId(user.google_id);

    if (!refreshToken) {
      this.logger.warn(
        `refresh: no refresh token in DB for user=${user.email} (${user.google_id}) — cookie=${hasCookie} bearer=${hasBearer} instance=${instance}`,
      );
      throw new UnauthorizedException('Refresh token missing');
    }

    if (!this.authService.validateRefreshToken(refreshToken)) {
      this.logger.warn(
        `refresh: stored refresh token invalid/expired for user=${user.email} (${user.google_id}) instance=${instance}`,
      );
      throw new UnauthorizedException('Invalid refresh token');
    }

    this.logger.log(`refresh: success for user=${user.email} (${user.google_id}) — bearer=${hasBearer} cookie=${hasCookie} instance=${instance}`);

    const newAccessToken = this.authService.generateAccessToken(user);
    res.cookie('access_token', newAccessToken, this.cookieConfig);
    res.status(200).json({ accessToken: newAccessToken });
  }

  private extractBearerToken(req): string | null {
    const header = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) {
      return null;
    }
    return header.slice('Bearer '.length);
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
