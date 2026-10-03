import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { parseSessionContext } from '../context/session-context';
import { FeatureAccessService } from './feature-access.service';
import { FeatureKey } from './feature-keys';
import { FEATURE_METADATA_KEY } from './feature.decorator';

/**
 * Enforces `@Feature(key)`. Registered after ContextEnforcementInterceptor
 * (APP_INTERCEPTOR providers run in registration order), so by now the scope
 * check has passed and req.user.ctx holds the verified org context.
 */
@Injectable()
export class FeatureEnforcementInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly features: FeatureAccessService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    if (!req.user) return next.handle();

    const key = this.reflector.getAllAndOverride<FeatureKey | undefined>(FEATURE_METADATA_KEY, [context.getHandler(), context.getClass()]);
    if (!key) return next.handle();

    if (!(await this.features.isEnabled(parseSessionContext(req.user.ctx), key))) {
      throw new ForbiddenException({ code: 'FEATURE_DISABLED', message: 'This feature is not enabled for your organization' });
    }
    return next.handle();
  }
}
