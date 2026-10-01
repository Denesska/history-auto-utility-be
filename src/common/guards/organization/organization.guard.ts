import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { REQUIRED_ORG_ROLE_KEY } from '../../decorators/required-org-role.decorator';

/**
 * Gates routes under `/organization/:organizationId/**`. With no
 * `@RequiredOrgRole`, any accepted member may proceed. With
 * `@RequiredOrgRole(SUPER_ADMIN)`, only an accepted SUPER_ADMIN may — see
 * the decorator's doc comment for why this isn't a ranked hierarchy like
 * `CarAccessGuard`.
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.getAllAndOverride<OrganizationRole>(
      REQUIRED_ORG_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const userId: number | undefined = request.user?.id;
    const organizationId = Number(request.params?.organizationId);

    if (!userId || isNaN(organizationId)) {
      throw new ForbiddenException('Missing user or organization context');
    }

    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
    });

    if (!membership || !membership.accepted_at) {
      throw new ForbiddenException('No accepted membership in this organization');
    }

    if (requiredRole && membership.role !== requiredRole) {
      throw new ForbiddenException(`Requires ${requiredRole} role, current role is ${membership.role}`);
    }

    return true;
  }
}
