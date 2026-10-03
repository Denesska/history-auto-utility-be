import { CallHandler, ExecutionContext, ForbiddenException, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationRole } from '@prisma/client';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { BUSINESS_ROLES_METADATA_KEY } from './business-roles.decorator';
import { ALLOW_NO_ORG_METADATA_KEY, SCOPE_METADATA_KEY, ScopeName } from './scope.decorator';
import { parseSessionContext } from './session-context';

/**
 * Global enforcement of `@Scope(...)` (see ACCOUNT-CONTEXT.md, "Enforcement").
 *
 * Why an interceptor and not an APP_GUARD: JWT auth is applied per controller
 * (`@UseGuards(JwtAuthGuard)`), and global guards run BEFORE controller-level
 * guards, so a global guard would never see `req.user`. Interceptors run after
 * all guards, so the user (and its `ctx`) is known here, and the check still
 * happens before pipes and the handler. (JwtAuthGuard itself lives in the auth
 * module and is left untouched.) Routes without an authenticated user
 * (login, public relays, catalog) are skipped.
 *
 * Because it runs after controller guards, guards that look at cars
 * (CarAccessGuard) do their own context check; the data layer
 * (`CarAccessService`) is context-aware as well, so this is not the only line
 * of defence.
 */
@Injectable()
export class ContextEnforcementInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ContextEnforcementInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    if (!req.user) return next.handle();

    const handler = context.getHandler();
    const cls = context.getClass();
    const targets = [handler, cls];

    const scopes = this.reflector.getAllAndOverride<ScopeName[] | undefined>(SCOPE_METADATA_KEY, targets);
    if (!scopes?.length) {
      // Fail closed on purpose: a forgotten classification must surface immediately.
      this.logger.error(`Authenticated route has no @Scope(): ${cls.name}.${handler.name} (${req.method} ${req.url}) - rejecting with 403`);
      throw new ForbiddenException({ code: 'SCOPE_NOT_DECLARED', message: 'This route has no declared context scope' });
    }

    const ctx = parseSessionContext(req.user.ctx);

    if (!scopes.includes('any') && !scopes.includes(ctx.type)) {
      throw new ForbiddenException({ code: 'WRONG_CONTEXT', message: `This route is not available in the ${ctx.type} context` });
    }

    if (ctx.type !== 'business') return next.handle();

    const allowNoOrg = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_NO_ORG_METADATA_KEY, targets) === true;

    if (ctx.orgId == null) {
      if (!allowNoOrg) {
        throw new ForbiddenException({ code: 'NO_ORGANIZATION_SELECTED', message: 'Select an organization first' });
      }
      return next.handle();
    }

    // One cheap PK lookup per business request: membership may have been
    // revoked / the role changed since the token was issued, so the JWT's
    // orgRole is never trusted. The fresh role replaces it on req.user.ctx.
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organization_id_user_id: { organization_id: ctx.orgId, user_id: req.user.id } },
      select: { role: true, accepted_at: true },
    });

    if (!membership?.accepted_at) {
      // Org picker / context-switch routes must keep working so the user can
      // choose another organization after being removed from this one.
      if (allowNoOrg) {
        req.user.ctx = { type: 'business', orgId: ctx.orgId };
        return next.handle();
      }
      throw new ForbiddenException({ code: 'MEMBERSHIP_REVOKED', message: 'You are no longer a member of this organization' });
    }

    req.user.ctx = { type: 'business', orgId: ctx.orgId, orgRole: membership.role };

    // Never let a request address another organization than the session's one.
    // Skipped on allowNoOrg routes (e.g. accepting an invite into a different org).
    if (!allowNoOrg) {
      const rawParam = req.params?.organizationId ?? req.params?.orgId;
      if (rawParam !== undefined && Number(rawParam) !== ctx.orgId) {
        throw new ForbiddenException({ code: 'ORGANIZATION_MISMATCH', message: 'This session is bound to a different organization' });
      }
    }

    const allowedRoles = this.reflector.getAllAndOverride<OrganizationRole[] | undefined>(BUSINESS_ROLES_METADATA_KEY, targets);
    if (allowedRoles?.length && !allowedRoles.includes(membership.role)) {
      throw new ForbiddenException({ code: 'ROLE_NOT_ALLOWED', message: 'Your role in this organization cannot use this feature' });
    }

    return next.handle();
  }
}
