import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ActivityService, ClientPlatform } from './activity.service';

const PLATFORMS: readonly ClientPlatform[] = ['ios', 'android', 'web'];
const VERSION_RE = /^[0-9A-Za-z.+-]{1,20}$/;

/**
 * Global interceptor: every authenticated HTTP request marks its user as
 * active today. Interceptors run after guards, so `req.user` is already set
 * by JwtAuthGuard on protected routes; public routes are simply skipped.
 *
 * The client identifies itself with `X-Client-Platform` / `X-Client-Version`
 * (set by the frontend's auth-token interceptor). Both are validated — they're
 * user-controlled and end up grouped on the admin page.
 */
@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private readonly activity: ActivityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest();
      const userId: unknown = req.user?.id;
      // The admin page's own polling isn't product usage.
      const isAdminRoute = typeof req.url === 'string' && req.url.startsWith('/api/admin');
      if (typeof userId === 'number' && !isAdminRoute) {
        const rawPlatform = String(req.headers['x-client-platform'] ?? '').toLowerCase();
        const rawVersion = String(req.headers['x-client-version'] ?? '');
        const platform = (PLATFORMS as string[]).includes(rawPlatform) ? (rawPlatform as ClientPlatform) : null;
        const version = VERSION_RE.test(rawVersion) ? rawVersion : null;
        this.activity.record(userId, platform, version);
      }
    }
    return next.handle();
  }
}
