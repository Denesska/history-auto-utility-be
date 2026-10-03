import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtUserPayload } from './dto/jwt-payload.dto';
import { DEV_BYPASS_USER } from './auth.constants';
import { parseSessionContext, SessionContext } from '../../common/context/session-context';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  generateAccessToken(user: JwtUserPayload, ctx: SessionContext): string {
    return this.jwtService.sign(
      { sub: user.google_id, email: user.email, ctx },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
    );
  }

  generateRefreshToken(userId: string, ctx: SessionContext): string {
    return this.jwtService.sign(
      { sub: userId, ctx },
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

  /** Context a refresh token was issued with; personal for refresh tokens issued before contexts existed. */
  getRefreshTokenContext(refreshToken: string): SessionContext | null {
    try {
      const decoded = this.jwtService.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
      return decoded?.ctx ? parseSessionContext(decoded.ctx) : null;
    } catch {
      return null;
    }
  }

  /**
   * Business login context: the single accepted organization is auto-selected
   * (with the caller's role); zero or several leave `orgId` null so the
   * frontend shows the organization picker.
   */
  async resolveBusinessContext(userId: number, preferredOrgId?: number): Promise<SessionContext> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { user_id: userId, accepted_at: { not: null } },
      select: { organization_id: true, role: true },
    });
    if (memberships.length === 1) {
      return { type: 'business', orgId: memberships[0].organization_id, orgRole: memberships[0].role };
    }
    // Logged in through a company code: that organization wins over the picker.
    const preferred = preferredOrgId ? memberships.find(m => m.organization_id === preferredOrgId) : undefined;
    if (preferred) {
      return { type: 'business', orgId: preferred.organization_id, orgRole: preferred.role };
    }
    return { type: 'business', orgId: null };
  }

  /** Context for POST /auth/context; throws 403 NOT_ORG_MEMBER unless the user has an ACCEPTED membership in the organization. */
  async buildOrganizationContext(userId: number, organizationId: number): Promise<SessionContext> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
      select: { role: true, accepted_at: true },
    });
    if (!membership || !membership.accepted_at) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'NOT_ORG_MEMBER',
        message: 'You are not an accepted member of this organization',
      });
    }
    return { type: 'business', orgId: organizationId, orgRole: membership.role };
  }

  /** `/auth/me` helper: adds `orgName` to a business ctx that has an organization selected. */
  async enrichContext(ctx: SessionContext): Promise<SessionContext & { orgName?: string | null }> {
    if (ctx.type !== 'business' || ctx.orgId === null) {
      return ctx;
    }
    const org = await this.prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { name: true } });
    return { ...ctx, orgName: org?.name ?? null };
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

  // Dev-only: upserts the fixed dev-bypass identity so /auth/dev-login always
  // has a User row to issue tokens for, without touching real accounts.
  async upsertDevBypassUser(): Promise<JwtUserPayload> {
    const user = await this.prisma.user.upsert({
      where: { google_id: DEV_BYPASS_USER.google_id },
      update: {},
      create: { ...DEV_BYPASS_USER },
    });
    return { id: user.id, google_id: user.google_id, email: user.email };
  }

  /**
   * Resolves the local-login forms to a user: a bare `username` (no `@`)
   * looks up `User.username` (globally unique); a value with `@` is the
   * legacy `username@company-code` email identifier. The deprecated
   * `companyCode` (with `username`) still resolves `username@code` and
   * requires membership of that org. Any miss is the same generic 401.
   */
  async validateLocalLoginInput(input: { email?: string; companyCode?: string; username?: string; password: string }) {
    const identifier = (input.username ?? input.email ?? '').trim().toLowerCase();
    let organizationId: number | undefined;
    let where: { username: string } | { email: string };
    if (input.companyCode && input.username) {
      const code = input.companyCode.trim().toLowerCase();
      where = { email: `${identifier}@${code}` };
      const org = await this.prisma.organization.findUnique({ where: { login_code: code }, select: { id: true } });
      organizationId = org?.id;
    } else if (identifier.includes('@')) {
      where = { email: identifier };
    } else {
      where = { username: identifier };
    }
    this.logger.debug(`local-login: lookup by ${JSON.stringify(where)}`);

    const user = await this.validateLocalLogin(where, input.password, organizationId, !!input.companyCode);
    return { user, organizationId };
  }

  /** Verifies a company-managed account's password; throws if the account doesn't exist, isn't password-based, is disabled, or the password is wrong. */
  async validateLocalLogin(
    where: { username: string } | { email: string },
    password: string,
    requiredOrganizationId?: number,
    requireOrganization = false,
  ): Promise<JwtUserPayload & { must_change_password: boolean }> {
    const user = await this.prisma.user.findUnique({ where });
    this.logger.debug(`local-login: lookup ${user ? `matched user ${user.id}` : 'matched no user'}`);
    if (!user || !user.password_hash || user.disabled_at) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (requireOrganization) {
      const membership = requiredOrganizationId
        ? await this.prisma.organizationMembership.findUnique({
            where: { organization_id_user_id: { organization_id: requiredOrganizationId, user_id: user.id } },
            select: { accepted_at: true },
          })
        : null;
      if (!membership?.accepted_at) {
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { id: user.id, google_id: user.google_id, email: user.email, must_change_password: user.must_change_password };
  }

  /**
   * Self-service password change — covers both the forced flow right after a
   * local login/reset (must_change_password: true) and a voluntary change
   * later. Requires the current password even in the forced case (it's the
   * default one the company gave out) so a stolen access token alone can't
   * silently take over the account.
   */
  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.password_hash) {
      throw new BadRequestException('This account has no password login to change');
    }

    const matches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const password_hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { password_hash, must_change_password: false } });
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

      return { google_id: decoded.sub as string, email: decoded['email'], ctx: parseSessionContext(decoded['ctx']) };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
