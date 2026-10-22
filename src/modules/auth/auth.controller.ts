import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { FeatureAccessService } from '../../common/features/feature-access.service';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthGuard } from './google-auth.guard';
import { RequestWithUser } from './express-request.interface';
import { LocalLoginDto } from './dto/local-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SwitchContextDto } from './dto/switch-context.dto';
import {
  ALLOW_PERSONAL_BUSINESS_SWITCH,
  ALLOWED_LOGIN_ORIGINS,
  isMobileLoginOrigin,
} from './auth.constants';
import { Scope } from '../../common/context/scope.decorator';
import { SessionContext } from '../../common/context/session-context';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly cookieConfig: any;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly featureAccess: FeatureAccessService,
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

  // `?context=personal|business` (default personal) is remembered in the
  // `login_ctx` cookie by GoogleAuthGuard and read back in the callback.
  @Get('google')
  @Scope('any')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth login (?context=personal|business)' })
  async login(): Promise<void> {
    // Passport redirects to Google — this handler never executes
  }

  @Get('google/redirect')
  @Scope('any')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  @ApiResponse({ status: 302, description: 'Authenticated and redirected to frontend.' })
  @ApiResponse({ status: 401, description: 'Google authentication failed.' })
  async googleAuthRedirect(@Req() req, @Res() res: Response): Promise<void> {
    await this.issueSessionAndRedirect(req.user, req.cookies?.login_ctx === 'business' ? 'business' : 'personal', req, res);
  }

  // Dev-only shortcut that skips Google entirely: logs in as a fixed
  // dev-bypass account so Claude/local tooling can reach authenticated
  // screens without a real Google login. Hard-gated so it can never exist
  // on test/prod, even if DEV_AUTH_BYPASS were mistakenly set there.
  @Get('dev-login')
  @Scope('any')
  @ApiOperation({ summary: '[dev only] Log in as the dev-bypass user, no Google OAuth' })
  async devLogin(@Req() req, @Res() res: Response): Promise<void> {
    const isProdEnv = this.configService.get<string>('NODE_ENV') === 'production';
    const bypassEnabled = this.configService.get<string>('DEV_AUTH_BYPASS') === 'true';

    if (isProdEnv || !bypassEnabled) {
      throw new NotFoundException();
    }

    const user = await this.authService.upsertDevBypassUser();
    await this.issueSessionAndRedirect(user, req.query?.context === 'business' ? 'business' : 'personal', req, res);
  }

  private async issueSessionAndRedirect(
    user: { id?: number; google_id: string; email: string; is_company_managed?: boolean },
    contextType: 'personal' | 'business',
    req,
    res: Response,
  ): Promise<void> {
    res.clearCookie('access_token', this.cookieConfig);
    res.clearCookie('login_ctx', { path: '/' });

    const defaultFeBaseUrl = this.configService.get<string>('FE_BASE_URL', 'http://localhost:4200');
    const loginOrigin = req.cookies?.login_origin as string | undefined;
    const feBaseUrl =
      loginOrigin && (ALLOWED_LOGIN_ORIGINS as readonly string[]).includes(loginOrigin)
        ? loginOrigin
        : defaultFeBaseUrl;

    res.clearCookie('login_origin', { path: '/' });

    // Company-managed accounts never get a personal environment. Reported to
    // the frontend as a query param on the login page (no tokens issued).
    if (contextType === 'personal' && user.is_company_managed) {
      res.redirect(`${feBaseUrl}/auth/login?error=company_account_personal_login`);
      return;
    }

    const ctx: SessionContext =
      contextType === 'business' ? await this.authService.resolveBusinessContext(user.id) : { type: 'personal' };
    const accessToken = this.authService.generateAccessToken(user, ctx);
    const refreshToken = this.authService.generateRefreshToken(user.google_id, ctx);
    await this.authService.saveRefreshToken(user.google_id, refreshToken);
    res.cookie('access_token', accessToken, this.cookieConfig);

    if (isMobileLoginOrigin(loginOrigin)) {
      res.redirect(`${feBaseUrl}/auth/token?token=${encodeURIComponent(accessToken)}`);
      return;
    }

    // The garage is the landing page (there is no /main/overview route).
    res.redirect(`${feBaseUrl}/main/cars`);
  }

  // Login path for a company-created account (see OrganizationService.createLocalMember) —
  // username+password instead of Google OAuth, otherwise issues the exact same
  // access/refresh tokens as googleAuthRedirect. `mustChangePassword` tells the
  // frontend to route straight to the forced change-password screen instead of
  // the app.
  @Post('local-login')
  @Scope('any')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in with a company-issued username/password account' })
  @ApiResponse({ status: 200, description: 'Authenticated; access token issued.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or disabled account.' })
  @ApiResponse({ status: 403, description: 'LOCAL_LOGIN_BUSINESS_ONLY: context "personal" requested.' })
  async localLogin(
    @Body() dto: LocalLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; mustChangePassword: boolean; ctx: SessionContext; enabled_features: string[] }> {
    if (dto.context === 'personal') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'LOCAL_LOGIN_BUSINESS_ONLY',
        message: 'Username/password login is only available for business accounts',
      });
    }

    const { user, organizationId } = await this.authService.validateLocalLoginInput(dto);

    res.clearCookie('access_token', this.cookieConfig);
    const ctx = await this.authService.resolveBusinessContext(user.id, organizationId);
    const accessToken = this.authService.generateAccessToken(user, ctx);
    const refreshToken = this.authService.generateRefreshToken(user.google_id, ctx);
    await this.authService.saveRefreshToken(user.google_id, refreshToken);
    res.cookie('access_token', accessToken, this.cookieConfig);

    return { accessToken, mustChangePassword: user.must_change_password, ctx, enabled_features: await this.featureAccess.enabledFeatures(ctx) };
  }

  // Picks/switches the active organization of a BUSINESS session. Allowed
  // without an org already selected (that's how the picker works).
  @Post('context')
  @Scope('business', { allowNoOrg: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Select the active organization of a business session; issues new tokens' })
  @ApiResponse({ status: 200, description: 'New access token issued with ctx.orgId set.' })
  @ApiResponse({ status: 403, description: 'PERSONAL_SESSION or NOT_ORG_MEMBER.' })
  async switchContext(
    @Req() req: RequestWithUser,
    @Body() dto: SwitchContextDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; ctx: SessionContext; enabled_features: string[] }> {
    // Policy check — see ALLOW_PERSONAL_BUSINESS_SWITCH and ACCOUNT-CONTEXT.md "Future: merge".
    const currentCtx = (req.user as any).ctx as SessionContext | undefined;
    if (currentCtx?.type !== 'business' && !ALLOW_PERSONAL_BUSINESS_SWITCH) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PERSONAL_SESSION',
        message: 'Switching to a business context requires logging in on the Business tab',
      });
    }

    const user = req.user as any;
    const ctx = await this.authService.buildOrganizationContext(user.id, dto.organizationId);
    const accessToken = this.authService.generateAccessToken(user, ctx);
    const refreshToken = this.authService.generateRefreshToken(user.google_id, ctx);
    await this.authService.saveRefreshToken(user.google_id, refreshToken);
    res.cookie('access_token', accessToken, this.cookieConfig);

    return { accessToken, ctx, enabled_features: await this.featureAccess.enabledFeatures(ctx) };
  }

  @Post('change-password')
  @Scope('any', { allowNoOrg: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Change the current user\'s own password (company-managed accounts only)' })
  @ApiResponse({ status: 200, description: 'Password changed.' })
  @ApiResponse({ status: 400, description: 'Account has no password login.' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect.' })
  async changePassword(@Req() req: RequestWithUser, @Body() dto: ChangePasswordDto): Promise<void> {
    await this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }

  @Post('refresh')
  @Scope('any')
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

    // The refresh token is authoritative for the context (it can't be forged
    // client-side); pre-context refresh tokens fall back to the access token's ctx.
    const refreshedCtx = this.authService.getRefreshTokenContext(refreshToken) ?? user.ctx ?? { type: 'personal' };
    // Re-validate a business context against the CURRENT membership — the ctx
    // frozen in the refresh token at login time otherwise never catches an org
    // picked afterwards (POST /auth/context) or a role/membership change until
    // a full new login (see ACCOUNT-CONTEXT.md).
    const ctx = await this.authService.revalidateBusinessContext(user.google_id, refreshedCtx);
    const newAccessToken = this.authService.generateAccessToken(user, ctx);
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

  // allowNoOrg: a business session right after login has no organization yet, and the
  // frontend needs /auth/me to learn exactly that (it then shows the organization picker).
  @Get('me')
  @Scope('any', { allowNoOrg: true })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get authenticated user profile' })
  @ApiResponse({ status: 200, description: 'User profile returned.' })
  @ApiResponse({ status: 401, description: 'Invalid or missing access token.' })
  async getProfile(@Req() req): Promise<any> {
    const ctx: SessionContext = req.user.ctx ?? { type: 'personal' };
    return { ...req.user, ctx: await this.authService.enrichContext(ctx), enabled_features: await this.featureAccess.enabledFeatures(ctx) };
  }

  @Post('logout')
  @Scope('any', { allowNoOrg: true })
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
