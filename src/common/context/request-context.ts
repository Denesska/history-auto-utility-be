import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { parseSessionContext, SessionContext } from './session-context';

/**
 * Per-request store holding the Express request object itself (not a copy of
 * the context). Why a reference: this middleware runs BEFORE every guard, so
 * `req.user` doesn't exist yet when the store is created. Guards that run
 * early (CarAccessGuard) and services deep in the call chain
 * (`CarAccessService.resolveUserRoleById`, suppliers, sale contracts...) read
 * `req.user.ctx` lazily at call time, i.e. after JwtAuthGuard populated it and
 * after the ContextEnforcementInterceptor refreshed `orgRole` from the DB.
 * This avoids threading the session context through dozens of service
 * signatures.
 */
const requestStore = new AsyncLocalStorage<{ req: any }>();

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void): void {
    requestStore.run({ req }, next);
  }
}

/**
 * The session context of the HTTP request currently being served, or
 * `undefined` outside a request (cron jobs, websocket handlers) or on a route
 * with no authenticated user. Callers decide what "no context" means for them.
 */
export function getRequestSessionContext(): SessionContext | undefined {
  const req = requestStore.getStore()?.req;
  if (!req?.user) return undefined;
  return parseSessionContext(req.user.ctx);
}
