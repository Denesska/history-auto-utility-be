import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Lets the request through only for users with `User.is_admin = true`.
 * Must run after JwtAuthGuard (needs `req.user.id`). Checked against the DB
 * on every call rather than baked into the JWT, so revoking admin takes
 * effect immediately.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const userId = context.switchToHttp().getRequest().user?.id;
    if (typeof userId !== 'number') throw new ForbiddenException();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { is_admin: true } });
    if (!user?.is_admin) throw new ForbiddenException();
    return true;
  }
}
