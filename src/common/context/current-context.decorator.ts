import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { parseSessionContext, SessionContext } from './session-context';

/** Injects the session context from the validated JWT (`req.user.ctx`); personal if absent (tokens issued before contexts existed). */
export const CurrentContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionContext => {
  const req = ctx.switchToHttp().getRequest();
  return parseSessionContext(req.user?.ctx);
});
