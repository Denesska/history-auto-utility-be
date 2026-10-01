import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { ChangeMemberRoleDto } from './dto/change-member-role.dto';
import { MyOrganizationDto, OrganizationMembershipDto } from './dto/organization.dto';

const memberInclude = {
  user: { select: { id: true, email: true, first_name: true, last_name: true, picture: true } },
  invited_by: { select: { id: true, email: true, first_name: true, last_name: true, picture: true } },
};

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  private toMembershipDto(entry: any): OrganizationMembershipDto {
    return {
      id: entry.id,
      organization_id: entry.organization_id,
      role: entry.role,
      user: entry.user,
      invited_by: entry.invited_by,
      accepted_at: entry.accepted_at,
      created_at: entry.created_at,
    };
  }

  /** The creator becomes the organization's first SUPER_ADMIN, accepted immediately. */
  async createOrganization(dto: CreateOrganizationDto, creatorUserId: number): Promise<MyOrganizationDto> {
    const organization = await this.prisma.organization.create({
      data: {
        name: dto.name,
        members: {
          create: {
            user_id: creatorUserId,
            role: OrganizationRole.SUPER_ADMIN,
            invited_by_user_id: creatorUserId,
            accepted_at: new Date(),
          },
        },
      },
    });

    return { id: organization.id, name: organization.name, role: OrganizationRole.SUPER_ADMIN, accepted_at: new Date() };
  }

  /** Every organization the user belongs to, pending invites included — the FE shows those as "pending". */
  async getMyOrganizations(userId: number): Promise<MyOrganizationDto[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { user_id: userId },
      include: { organization: { select: { id: true, name: true } } },
    });

    return memberships.map(m => ({
      id: m.organization.id,
      name: m.organization.name,
      role: m.role,
      accepted_at: m.accepted_at,
    }));
  }

  async getMembers(organizationId: number): Promise<OrganizationMembershipDto[]> {
    const entries = await this.prisma.organizationMembership.findMany({
      where: { organization_id: organizationId },
      include: memberInclude,
      orderBy: { created_at: 'asc' },
    });
    return entries.map(e => this.toMembershipDto(e));
  }

  async inviteMember(organizationId: number, inviterUserId: number, dto: InviteMemberDto): Promise<OrganizationMembershipDto> {
    const email = dto.email.trim().toLowerCase();
    const target = await this.prisma.user.findUnique({ where: { email } });
    if (!target) throw new NotFoundException(`No registered user with email ${email}`);

    const existing = await this.prisma.organizationMembership.findUnique({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: target.id } },
    });
    if (existing) throw new BadRequestException('User already has a membership or a pending invitation');

    const entry = await this.prisma.organizationMembership.create({
      data: {
        organization_id: organizationId,
        user_id: target.id,
        role: dto.role,
        invited_by_user_id: inviterUserId,
      },
      include: memberInclude,
    });

    return this.toMembershipDto(entry);
  }

  async acceptInvitation(organizationId: number, userId: number): Promise<OrganizationMembershipDto> {
    const entry = await this.prisma.organizationMembership.findUnique({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
    });
    if (!entry) throw new NotFoundException('No invitation found for this organization');
    if (entry.accepted_at) throw new BadRequestException('Invitation already accepted');

    const updated = await this.prisma.organizationMembership.update({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
      data: { accepted_at: new Date() },
      include: memberInclude,
    });
    return this.toMembershipDto(updated);
  }

  async changeRole(organizationId: number, targetUserId: number, dto: ChangeMemberRoleDto): Promise<OrganizationMembershipDto> {
    const entry = await this.prisma.organizationMembership.findUnique({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: targetUserId } },
    });
    if (!entry) throw new NotFoundException('Membership not found');

    if (entry.role === OrganizationRole.SUPER_ADMIN && dto.role !== OrganizationRole.SUPER_ADMIN) {
      await this.assertNotLastSuperAdmin(organizationId, targetUserId);
    }

    const updated = await this.prisma.organizationMembership.update({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: targetUserId } },
      data: { role: dto.role },
      include: memberInclude,
    });
    return this.toMembershipDto(updated);
  }

  async removeMember(organizationId: number, targetUserId: number): Promise<void> {
    const entry = await this.prisma.organizationMembership.findUnique({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: targetUserId } },
    });
    if (!entry) throw new NotFoundException('Membership not found');

    if (entry.role === OrganizationRole.SUPER_ADMIN) {
      await this.assertNotLastSuperAdmin(organizationId, targetUserId);
    }

    await this.prisma.organizationMembership.delete({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: targetUserId } },
    });
  }

  async leaveOrganization(organizationId: number, userId: number): Promise<void> {
    await this.removeMember(organizationId, userId);
  }

  /** Blocks demoting/removing the organization's one remaining accepted SUPER_ADMIN — it would leave no one able to manage it. */
  private async assertNotLastSuperAdmin(organizationId: number, excludingUserId: number): Promise<void> {
    const otherSuperAdmins = await this.prisma.organizationMembership.count({
      where: {
        organization_id: organizationId,
        role: OrganizationRole.SUPER_ADMIN,
        accepted_at: { not: null },
        user_id: { not: excludingUserId },
      },
    });
    if (otherSuperAdmins === 0) {
      throw new ForbiddenException('Cannot remove the organization\'s last SUPER_ADMIN');
    }
  }
}
