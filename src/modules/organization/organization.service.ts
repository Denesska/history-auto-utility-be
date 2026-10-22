import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { NotificationType, OrganizationRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CarService } from '../car/car.service';
import { MailService } from '../mail/mail.service';
import { MailLang, resolveMailLang } from '../mail/templates/base-email.template';
import { NotificationsService } from '../notifications/notifications.service';
import { INVITABLE_ROLES, canAssignRole, canManageMember, canSeeMember } from '../../common/guards/organization/organization-roles';
import { loginCodeBase } from '../../common/util/slugify.util';
import { USERNAME_REGEX, generateUniqueUsername } from '../../common/util/username.util';
import { DEFAULT_COMPANY_PASSWORD } from '../auth/auth.constants';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { ChangeMemberRoleDto } from './dto/change-member-role.dto';
import { CreateLocalMemberDto } from './dto/create-local-member.dto';
import { CreateLocalMemberResultDto } from './dto/create-local-member-result.dto';
import { ResetLocalPasswordResultDto } from './dto/reset-local-password-result.dto';
import { MyOrganizationDto, OrganizationMembershipDto } from './dto/organization.dto';
import { OrganizationCarDto } from './dto/organization-car.dto';
import { FeatureAccessService } from '../../common/features/feature-access.service';
import { BusinessAccessService } from '../business-access/business-access.service';

const BCRYPT_ROUNDS = 10;

/** Who can add/remove cars from the fleet — Director-tier plus the operational FLEET_ADMIN; not FINANCE, not DRIVER. */
const CAN_MANAGE_CARS_ROLES: ReadonlySet<OrganizationRole> = new Set([
  OrganizationRole.OWNER,
  OrganizationRole.SUPER_ADMIN,
  OrganizationRole.FLEET_ADMIN,
]);

/** Who sees the organization's company code (the roles that create/hand out company-managed accounts). */
const LOGIN_CODE_VISIBLE_ROLES: ReadonlySet<OrganizationRole> = new Set([
  OrganizationRole.OWNER,
  OrganizationRole.SUPER_ADMIN,
  OrganizationRole.FLEET_ADMIN,
]);

const memberInclude = {
  user: { select: { id: true, email: true, first_name: true, last_name: true, picture: true, is_company_managed: true, username: true } },
  invited_by: { select: { id: true, email: true, first_name: true, last_name: true, picture: true, is_company_managed: true, username: true } },
};

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carService: CarService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly featureAccess: FeatureAccessService,
    private readonly businessAccessService: BusinessAccessService,
  ) {}

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

  /** Unique `login_code` from the org name: slug, then `-2`, `-3`... on collision. */
  private async generateLoginCode(name: string): Promise<string> {
    const base = loginCodeBase(name);
    for (let n = 1; ; n++) {
      const suffix = n === 1 ? '' : `-${n}`;
      const candidate = n === 1 ? base : `${loginCodeBase(name, suffix.length)}${suffix}`;
      const taken = await this.prisma.organization.findUnique({ where: { login_code: candidate }, select: { id: true } });
      if (!taken) return candidate;
    }
  }

  /** The login code is only shown to the roles that hand out accounts (see LOGIN_CODE_VISIBLE_ROLES). */
  private visibleLoginCode(role: OrganizationRole, code: string | null): string | null {
    return LOGIN_CODE_VISIBLE_ROLES.has(role) ? code : null;
  }

  /** The creator becomes the organization's first SUPER_ADMIN, accepted immediately. */
  async createOrganization(dto: CreateOrganizationDto, creatorUserId: number): Promise<MyOrganizationDto> {
    // Business account approval gate — see BusinessAccessService.assertCanCreateOrganization.
    // Enforced here (service level) so every caller of createOrganization is covered.
    await this.businessAccessService.assertCanCreateOrganization(creatorUserId);

    const organization = await this.prisma.organization.create({
      data: {
        name: dto.name,
        login_code: await this.generateLoginCode(dto.name),
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

    return { id: organization.id, name: organization.name, role: OrganizationRole.SUPER_ADMIN, accepted_at: new Date(), login_code: organization.login_code };
  }

  /** Every organization the user belongs to, pending invites included — the FE shows those as "pending". */
  async getMyOrganizations(userId: number): Promise<MyOrganizationDto[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { user_id: userId },
      include: { organization: { select: { id: true, name: true, login_code: true } } },
    });

    return memberships.map(m => ({
      id: m.organization.id,
      name: m.organization.name,
      role: m.role,
      accepted_at: m.accepted_at,
      login_code: this.visibleLoginCode(m.role, m.organization.login_code),
    }));
  }

  /**
   * Filtered per the caller's own rank — "sees everything below them, never
   * above": OWNER/SUPER_ADMIN (Director) see the whole roster, a FLEET_ADMIN
   * only sees the Director who invited them plus the DRIVERs they personally
   * manage, FINANCE/MANAGER only see their own inviter, and everyone always
   * sees their own row. See `canSeeMember` in `organization-roles.ts`.
   */
  async getMembers(organizationId: number, actorUserId: number): Promise<OrganizationMembershipDto[]> {
    const entries = await this.prisma.organizationMembership.findMany({
      where: { organization_id: organizationId },
      include: memberInclude,
      orderBy: { created_at: 'asc' },
    });
    const actor = entries.find(e => e.user_id === actorUserId);
    if (!actor) throw new ForbiddenException('No accepted membership in this organization');

    return entries.filter(e => canSeeMember(actor, e)).map(e => this.toMembershipDto(e));
  }

  async inviteMember(organizationId: number, inviterUserId: number, dto: InviteMemberDto): Promise<OrganizationMembershipDto> {
    const inviterMembership = await this.prisma.organizationMembership.findUnique({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: inviterUserId } },
    });
    if (!inviterMembership || !canAssignRole(inviterMembership.role, dto.role)) {
      throw new ForbiddenException(`Role ${inviterMembership?.role} cannot invite a ${dto.role}`);
    }

    const email = dto.email.trim().toLowerCase();
    // Only an already-registered user can be invited today — inviting an email
    // with no HAU App account yet (and explaining what to do / where to get
    // the app) needs its own invite-by-email model. Tracked in B2B-STRATEGY.md.
    const target = await this.prisma.user.findUnique({ where: { email }, include: { settings: true } });
    if (!target) throw new NotFoundException(`No registered user with email ${email}`);

    const existing = await this.prisma.organizationMembership.findUnique({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: target.id } },
    });
    if (existing) throw new BadRequestException('User already has a membership or a pending invitation');

    const [entry, organization, inviter] = await Promise.all([
      this.prisma.organizationMembership.create({
        data: {
          organization_id: organizationId,
          user_id: target.id,
          role: dto.role,
          invited_by_user_id: inviterUserId,
        },
        include: memberInclude,
      }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: inviterUserId } }),
    ]);

    // Create the notification first so the WebSocket push to the invitee fires
    // immediately — sending the invitation email is a slower SMTP round-trip and
    // must not delay the realtime notification. Same ordering as CarAccessService.inviteUser.
    await this.notificationsService.create(target.id, NotificationType.ORG_INVITED, {
      organizationId,
      organizationName: organization.name,
      role: dto.role,
      invitedByName: `${inviter.first_name} ${inviter.last_name}`.trim(),
    });

    const lang: MailLang = resolveMailLang(target.settings?.language);
    await this.mailService.sendOrganizationInvitation(target.email, lang, {
      inviterName: `${inviter.first_name} ${inviter.last_name}`.trim(),
      organizationName: organization.name,
      role: dto.role,
      appUrl: this.configService.get<string>('FE_BASE_URL', 'http://localhost:4200'),
    });

    return this.toMembershipDto(entry);
  }

  private async isUsernameTaken(username: string): Promise<boolean> {
    return !!(await this.prisma.user.findUnique({ where: { username }, select: { id: true } }));
  }

  /** Only someone who can create accounts (can assign at least one role) may use the username helpers. */
  private async assertCanCreateLocalMembers(organizationId: number, actorUserId: number): Promise<void> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: actorUserId } },
    });
    if (!membership || INVITABLE_ROLES[membership.role].length === 0) {
      throw new ForbiddenException(`Role ${membership?.role} cannot create accounts`);
    }
  }

  /** Free username for the typed names: base, then + org initials, then + 2, 3... (global uniqueness). */
  async suggestUsername(organizationId: number, actorUserId: number, firstName: string, lastName: string): Promise<{ username: string }> {
    await this.assertCanCreateLocalMembers(organizationId, actorUserId);
    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
    const username = await generateUniqueUsername(firstName, lastName, organization.name, u => this.isUsernameTaken(u));
    return { username };
  }

  async isUsernameAvailable(organizationId: number, actorUserId: number, username: string): Promise<{ available: boolean }> {
    await this.assertCanCreateLocalMembers(organizationId, actorUserId);
    const normalized = (username ?? '').trim().toLowerCase();
    if (!USERNAME_REGEX.test(normalized)) {
      throw new BadRequestException('Username must be 3-20 lowercase letters or digits');
    }
    return { available: !(await this.isUsernameTaken(normalized)) };
  }

  /**
   * Creates a brand-new, company-owned account directly (no email invite, no
   * Google sign-in, no accept step) — the login the company hands out is
   * a short globally-unique `username` (generated from the names unless given) with a shared generic password
   * (DEFAULT_COMPANY_PASSWORD), forced to be changed on first login
   * (`must_change_password`). Meant for drivers/employees who don't have
   * (or shouldn't need) their own Google account — one of these is fully
   * owned by the organization: removeMember disables it outright instead of
   * just unlinking it, and only a Director-tier/Fleet-Admin caller allowed to
   * assign the chosen role (same `canAssignRole` matrix as inviteMember) can
   * create one. The plaintext password is returned here once and never
   * retrievable again — only resettable, via resetLocalPassword.
   */
  async createLocalMember(organizationId: number, actorUserId: number, dto: CreateLocalMemberDto): Promise<CreateLocalMemberResultDto> {
    const [actorMembership, organization] = await Promise.all([
      this.prisma.organizationMembership.findUnique({
        where: { organization_id_user_id: { organization_id: organizationId, user_id: actorUserId } },
      }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    ]);
    if (!actorMembership || !canAssignRole(actorMembership.role, dto.role)) {
      throw new ForbiddenException(`Role ${actorMembership?.role} cannot create a ${dto.role}`);
    }

    // Orgs created before login codes existed are backfilled, but never leave an org without one.
    const loginCode =
      organization.login_code ??
      (await this.prisma.organization.update({ where: { id: organizationId }, data: { login_code: await this.generateLoginCode(organization.name) } })).login_code!;
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    let username: string;
    if (dto.username?.trim()) {
      username = dto.username.trim().toLowerCase();
      if (!USERNAME_REGEX.test(username)) throw new BadRequestException('Username must be 3-20 lowercase letters or digits');
      if (await this.isUsernameTaken(username)) throw new ConflictException({ statusCode: 409, code: 'USERNAME_TAKEN', message: 'Username is already taken' });
    } else {
      username = await generateUniqueUsername(firstName, lastName, organization.name, u => this.isUsernameTaken(u));
    }
    // Internal identifier only (`email` is unique + required); the member logs in with `username`.
    const email = `${username}@${loginCode}`;
    const password_hash = await bcrypt.hash(DEFAULT_COMPANY_PASSWORD, BCRYPT_ROUNDS);

    let created;
    try {
      created = await this.prisma.user.create({
        data: {
          google_id: `local:${randomUUID()}`,
          email,
          username,
          first_name: firstName,
          last_name: lastName,
          picture: '',
          password_hash,
          must_change_password: true,
          is_company_managed: true,
          organization_memberships: {
            create: {
              organization_id: organizationId,
              role: dto.role,
              invited_by_user_id: actorUserId,
              accepted_at: new Date(),
            },
          },
        },
        include: {
          organization_memberships: { where: { organization_id: organizationId }, include: memberInclude },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ statusCode: 409, code: 'USERNAME_TAKEN', message: 'Username is already taken' });
      }
      throw e;
    }

    return {
      membership: this.toMembershipDto(created.organization_memberships[0]),
      credentials: { email, password: DEFAULT_COMPANY_PASSWORD, username },
    };
  }

  /**
   * Resets a company-managed member's password back to the shared generic
   * one and forces a change on next login — same rank check as
   * changeRole/removeMember (`canManageMember`). Also clears the refresh
   * token so an open session can't silently keep going past its current
   * (short-lived) access token; the caller's UI is expected to warn the
   * admin before calling this that the member will be locked out until they
   * log in again with the new default password.
   */
  async resetLocalPassword(organizationId: number, actorUserId: number, targetUserId: number): Promise<ResetLocalPasswordResultDto> {
    const [actor, entry, targetUser] = await Promise.all([
      this.prisma.organizationMembership.findUnique({
        where: { organization_id_user_id: { organization_id: organizationId, user_id: actorUserId } },
      }),
      this.prisma.organizationMembership.findUnique({
        where: { organization_id_user_id: { organization_id: organizationId, user_id: targetUserId } },
      }),
      this.prisma.user.findUnique({ where: { id: targetUserId } }),
    ]);
    if (!entry || !targetUser) throw new NotFoundException('Membership not found');
    if (!targetUser.is_company_managed) {
      throw new BadRequestException('Only a company-managed account can have its password reset here');
    }
    if (!actor || !canManageMember(actor.role, actor.user_id, entry)) {
      throw new ForbiddenException(`Role ${actor?.role} cannot reset this member's password`);
    }

    const password_hash = await bcrypt.hash(DEFAULT_COMPANY_PASSWORD, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { password_hash, must_change_password: true, refresh_token: null },
    });

    return { password: DEFAULT_COMPANY_PASSWORD };
  }

  async acceptInvitation(organizationId: number, userId: number): Promise<OrganizationMembershipDto> {
    const entry = await this.prisma.organizationMembership.findUnique({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
    });
    if (!entry) throw new NotFoundException('No invitation found for this organization');
    if (entry.accepted_at) throw new BadRequestException('Invitation already accepted');

    const [updated, organization, acceptedBy] = await Promise.all([
      this.prisma.organizationMembership.update({
        where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
        data: { accepted_at: new Date() },
        include: memberInclude,
      }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    ]);

    // Live update for the inviter — same WebSocket/push path as a car-share
    // acceptance, so they see it without refreshing and the unread badge ticks up.
    await this.notificationsService.create(entry.invited_by_user_id, NotificationType.ORG_INVITE_ACCEPTED, {
      organizationId,
      organizationName: organization.name,
      role: updated.role,
      acceptedByName: `${acceptedBy.first_name} ${acceptedBy.last_name}`.trim(),
    });

    return this.toMembershipDto(updated);
  }

  async changeRole(organizationId: number, actorUserId: number, targetUserId: number, dto: ChangeMemberRoleDto): Promise<OrganizationMembershipDto> {
    const [actor, entry] = await Promise.all([
      this.prisma.organizationMembership.findUnique({
        where: { organization_id_user_id: { organization_id: organizationId, user_id: actorUserId } },
      }),
      this.prisma.organizationMembership.findUnique({
        where: { organization_id_user_id: { organization_id: organizationId, user_id: targetUserId } },
      }),
    ]);
    if (!entry) throw new NotFoundException('Membership not found');
    if (!actor || !canManageMember(actor.role, actor.user_id, entry) || !canAssignRole(actor.role, dto.role)) {
      throw new ForbiddenException(`Role ${actor?.role} cannot change this member to ${dto.role}`);
    }

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

  /**
   * `actorUserId === targetUserId` is a self-removal ("leave"), always
   * allowed regardless of rank — only `assertNotLastSuperAdmin` can still
   * block it. For a company-managed account (see createLocalMember), removal
   * also disables the account outright (`disabled_at` + clears the refresh
   * token) instead of just unlinking it — unlike a Google-identity member,
   * it has no existence outside this organization, so losing the membership
   * means losing the account entirely.
   */
  async removeMember(organizationId: number, actorUserId: number, targetUserId: number): Promise<void> {
    const isSelf = actorUserId === targetUserId;
    const [actor, entry, targetUser] = await Promise.all([
      this.prisma.organizationMembership.findUnique({
        where: { organization_id_user_id: { organization_id: organizationId, user_id: actorUserId } },
      }),
      this.prisma.organizationMembership.findUnique({
        where: { organization_id_user_id: { organization_id: organizationId, user_id: targetUserId } },
      }),
      this.prisma.user.findUnique({ where: { id: targetUserId }, select: { is_company_managed: true } }),
    ]);
    if (!entry) throw new NotFoundException('Membership not found');
    if (!isSelf && (!actor || !canManageMember(actor.role, actor.user_id, entry))) {
      throw new ForbiddenException(`Role ${actor?.role} cannot remove this member`);
    }

    if (entry.role === OrganizationRole.SUPER_ADMIN) {
      await this.assertNotLastSuperAdmin(organizationId, targetUserId);
    }

    await this.prisma.$transaction([
      this.prisma.organizationMembership.delete({
        where: { organization_id_user_id: { organization_id: organizationId, user_id: targetUserId } },
      }),
      ...(targetUser?.is_company_managed
        ? [this.prisma.user.update({ where: { id: targetUserId }, data: { disabled_at: new Date(), refresh_token: null } })]
        : []),
    ]);
  }

  async leaveOrganization(organizationId: number, userId: number): Promise<void> {
    await this.removeMember(organizationId, userId, userId);
  }

  /**
   * Deletes the organization itself. Its cars and suppliers aren't deleted —
   * their `organization_id` is cleared first, so they just become personal
   * again (same "null = personal" convention as everywhere else), owned by
   * whoever originally created them. Memberships and feature-interest rows
   * cascade automatically (`onDelete: Cascade` on `Organization`).
   */
  async deleteOrganization(organizationId: number): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.car.updateMany({ where: { organization_id: organizationId }, data: { organization_id: null } }),
      this.prisma.supplier.updateMany({ where: { organization_id: organizationId }, data: { organization_id: null } }),
      this.prisma.organization.delete({ where: { id: organizationId } }),
    ]);
  }

  /**
   * Un-links a car from the organization — the car itself isn't deleted,
   * it just becomes personal again (back to whoever's `Car.user_id`).
   * Deleting the car outright is a separate, already-existing action for
   * its actual owner (the garage's "remove from garage" flow).
   */
  async removeCarFromOrganization(organizationId: number, carId: number, actingUserId: number): Promise<void> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: actingUserId } },
    });
    if (!membership || !CAN_MANAGE_CARS_ROLES.has(membership.role)) {
      throw new ForbiddenException('Not allowed to remove a car from this organization');
    }

    const car = await this.prisma.car.findUnique({ where: { id: carId } });
    if (!car || car.organization_id !== organizationId) {
      throw new NotFoundException('Car not found in this organization');
    }

    await this.prisma.car.update({ where: { id: carId }, data: { organization_id: null } });
  }

  /**
   * Every car currently in the fleet — shown on the Organization screen's
   * "company cars" section. No nickname here: it's private per viewer (see
   * CarUserNickname) and this list is admin-facing, so it always shows
   * make+model. The thumbnail reuses CarService's own photo-URL resolution
   * (presigned for non-local storage) rather than re-deriving it here.
   * `currentDriver` is the car's active `CarDriverAssignment` (`ended_at:
   * null`), if any — there's at most one per car by the driver-assignment
   * module's own invariant, `take: 1` is just a safety net — so an admin can
   * see at a glance who's driving each car, or that nobody is.
   * Disabled for this organization: still queries the (cheap, already-joined)
   * assignment row, but `currentDriver` is forced to `null` before it ever
   * leaves this method — same treatment as documents/maintenance being
   * omitted in BootstrapService, just applied at the mapping step instead of
   * the query since the two cases here share a single select shape.
   */
  async getOrganizationCars(organizationId: number): Promise<OrganizationCarDto[]> {
    const driverAssignmentEnabled = await this.featureAccess.isEnabled({ type: 'business', orgId: organizationId }, 'driver_assignment');

    const cars = await this.prisma.car.findMany({
      where: { organization_id: organizationId },
      select: {
        id: true, make: true, model: true, license_plate: true, vin: true, year: true,
        photos: { select: { url: true, is_default: true } },
        driver_assignments: {
          where: { ended_at: null },
          take: 1,
          select: { driver: { select: { id: true, first_name: true, last_name: true, picture: true } } },
        },
      },
      orderBy: { id: 'asc' },
    });

    return Promise.all(cars.map(async ({ photos, driver_assignments, ...rest }) => {
      const photo = photos.find(p => p.is_default) ?? photos[0];
      return {
        ...rest,
        photoUrl: photo ? await this.carService.resolveUrl(photo.url) : null,
        currentDriver: driverAssignmentEnabled ? driver_assignments[0]?.driver ?? null : null,
      };
    }));
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
