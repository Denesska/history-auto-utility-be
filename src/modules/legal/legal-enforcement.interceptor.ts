import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from './legal-versions';
import { SKIP_LEGAL_CONSENT_METADATA_KEY } from './skip-legal-consent.decorator';

/**
 * Global, fail-closed enforcement of GDPR terms/privacy acceptance (defense in
 * depth alongside the frontend gate): any authenticated request from a user
 * whose stored accepted versions don't both match the current constants is
 * rejected with 403 `{ code: 'LEGAL_ACCEPTANCE_REQUIRED' }`, except routes
 * marked `@SkipLegalConsent()`.
 *
 * Registered as an APP_INTERCEPTOR (not an APP_GUARD) for the same reason as
 * ContextEnforcementInterceptor: JWT auth is applied per controller
 * (`@UseGuards(JwtAuthGuard)`), and a global guard runs before controller-level
 * guards, so it would never see `req.user`. Interceptors run after all guards.
 *
 * Reads the two accepted-version fields straight off `req.user`, which
 * JwtStrategy.validate already loads on every authenticated request — no extra
 * DB query here.
 */
@Injectable()
export class LegalEnforcementInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    if (!req.user) return next.handle();

    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_LEGAL_CONSENT_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const needsAcceptance =
      req.user.terms_accepted_version !== CURRENT_TERMS_VERSION || req.user.privacy_accepted_version !== CURRENT_PRIVACY_VERSION;

    if (needsAcceptance) {
      throw new ForbiddenException({ code: 'LEGAL_ACCEPTANCE_REQUIRED', message: 'You must accept the current terms and privacy policy first' });
    }

    return next.handle();
  }
}
