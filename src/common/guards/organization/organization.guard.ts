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
import { ORG_ROLE_RANK } from './organization-roles';

/**
 * Gates routes under `/organization/:organizationId/**`. With no
 * `@RequiredOrgRole`, any accepted member may proceed. With
 * `@RequiredOrgRole(SUPER_ADMIN)`, an accepted member must rank at
 * SUPER_ADMIN or higher — i.e. SUPER_ADMIN (Director) or OWNER, since OWNER
 * outranks everyone and must pass every Director-gated check too. See
 * `organization-roles.ts` for the rank ladder and the invite/manage matrix
 * (finer-grained checks, like "FLEET_ADMIN may invite only DRIVER", live in
 * `OrganizationService` itself, not in this guard).
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

    if (requiredRole && ORG_ROLE_RANK[membership.role] > ORG_ROLE_RANK[requiredRole]) {
      throw new ForbiddenException(`Requires ${requiredRole} role or higher, current role is ${membership.role}`);
    }

    return true;
  }
}
