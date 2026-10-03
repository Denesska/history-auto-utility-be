import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Car, CarAccessRole, NotificationType, OrganizationRole, User } from '@prisma/client';
import { ROLE_RANK } from '../../common/guards/car-access/car-access.guard';
import { getRequestSessionContext } from '../../common/context/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { MailLang } from '../mail/templates/base-email.template';
import { NotificationsService } from '../notifications/notifications.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { CarAccessDto, SharedCarDto } from './dto/car-access.dto';

@Injectable()
export class CarAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── helpers ────────────────────────────────────────────────────────────

  private async resolveUser(googleId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { google_id: googleId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async assertOwner(carId: number, userId: number): Promise<Car> {
    const car = await this.prisma.car.findUnique({ where: { id: carId } });
    if (!car) throw new NotFoundException('Car not found');
    if (car.user_id !== userId) throw new ForbiddenException('Only the owner can manage access');
    return car;
  }

  private toAccessDto(entry: any): CarAccessDto {
    return {
      id: entry.id,
      car_id: entry.car_id,
      role: entry.role,
      user: {
        id: entry.user.id,
        email: entry.user.email,
        first_name: entry.user.first_name,
        last_name: entry.user.last_name,
        picture: entry.user.picture,
      },
      invited_by: {
        id: entry.invited_by.id,
        email: entry.invited_by.email,
        first_name: entry.invited_by.first_name,
        last_name: entry.invited_by.last_name,
        picture: entry.invited_by.picture,
      },
      accepted_at: entry.accepted_at,
      created_at: entry.created_at,
    };
  }

  private readonly accessInclude = {
    user: { select: { id: true, email: true, first_name: true, last_name: true, picture: true } },
    invited_by: { select: { id: true, email: true, first_name: true, last_name: true, picture: true } },
  };

  // ── invite ─────────────────────────────────────────────────────────────

  async inviteUser(carId: number, ownerGoogleId: string, dto: InviteUserDto): Promise<CarAccessDto> {
    const owner = await this.resolveUser(ownerGoogleId);
    const car = await this.assertOwner(carId, owner.id);

    if (dto.role === CarAccessRole.OWNER) {
      throw new BadRequestException('Cannot assign OWNER role via invite');
    }

    const email = dto.email.trim().toLowerCase();
    const target = await this.prisma.user.findUnique({
      where: { email },
      include: { settings: true },
    });
    if (!target) throw new NotFoundException(`No registered user with email ${email}`);
    if (target.id === owner.id) throw new BadRequestException('Cannot invite yourself');

    const existing = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: target.id } },
    });
    if (existing) throw new BadRequestException('User already has access or a pending invitation');

    const entry = await this.prisma.carUserAccess.create({
      data: {
        car_id: carId,
        user_id: target.id,
        role: dto.role,
        invited_by_user_id: owner.id,
      },
      include: this.accessInclude,
    });

    const lang: MailLang = target.settings?.language === 'en' ? 'en' : 'ro';
    // The recipient here is the invitee, not the owner — their own private
    // nickname (if any) doesn't exist yet, and the owner's private label for
    // this car must never be shown to anyone else. Always make+model.
    const carLabel = `${car.make} ${car.model}`.trim();

    // Create the notification first so the WebSocket push to the recipient fires
    // immediately — sending the invitation email is a slower SMTP round-trip and
    // must not delay the realtime notification.
    await this.notificationsService.create(target.id, NotificationType.CAR_SHARED, {
      carId: car.id,
      carLabel,
      role: dto.role,
      invitedByName: `${owner.first_name} ${owner.last_name}`.trim(),
    });

    await this.mailService.sendCarShareInvitation(target.email, lang, {
      inviterName: `${owner.first_name} ${owner.last_name}`.trim(),
      carLabel: car.license_plate ? `${carLabel} (${car.license_plate})` : carLabel,
      role: dto.role,
      appUrl: this.configService.get<string>('FE_BASE_URL', 'http://localhost:4200'),
    });

    return this.toAccessDto(entry);
  }

  // ── accept ─────────────────────────────────────────────────────────────

  async acceptInvitation(carId: number, inviteeGoogleId: string): Promise<CarAccessDto> {
    const user = await this.resolveUser(inviteeGoogleId);

    const entry = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: user.id } },
    });

    if (!entry) throw new NotFoundException('No invitation found for this car');
    if (entry.accepted_at) throw new BadRequestException('Invitation already accepted');

    const updated = await this.prisma.carUserAccess.update({
      where: { car_id_user_id: { car_id: carId, user_id: user.id } },
      data: { accepted_at: new Date() },
      include: this.accessInclude,
    });

    const car = await this.prisma.car.findUnique({ where: { id: carId } });
    if (car) {
      // The recipient here IS the owner — safe to show their own private label.
      const ownerNickname = await this.prisma.carUserNickname.findUnique({
        where: { car_id_user_id: { car_id: car.id, user_id: car.user_id } },
      });
      const carLabel = ownerNickname?.nickname ?? `${car.make} ${car.model}`.trim();
      await this.notificationsService.create(car.user_id, NotificationType.CAR_ACCESS_ACCEPTED, {
        carId: car.id,
        carLabel,
        role: updated.role,
        acceptedByName: `${user.first_name} ${user.last_name}`.trim(),
      });
    }

    return this.toAccessDto(updated);
  }

  // ── remove ─────────────────────────────────────────────────────────────

  async removeAccess(carId: number, ownerGoogleId: string, targetUserId: number): Promise<void> {
    const owner = await this.resolveUser(ownerGoogleId);
    const car = await this.assertOwner(carId, owner.id);

    if (targetUserId === owner.id) {
      throw new ForbiddenException('Cannot remove the owner');
    }

    const entry = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: targetUserId } },
    });
    if (!entry) throw new NotFoundException('Access record not found');

    await this.prisma.carUserAccess.delete({
      where: { car_id_user_id: { car_id: carId, user_id: targetUserId } },
    });

    // Recipient is the removed user, not the owner — never show the owner's
    // private label to them. Always make+model.
    const carLabel = `${car.make} ${car.model}`.trim();
    await this.notificationsService.create(targetUserId, NotificationType.CAR_ACCESS_REMOVED, {
      carId: car.id,
      carLabel,
      removedByName: `${owner.first_name} ${owner.last_name}`.trim(),
    });
  }

  // ── change role ────────────────────────────────────────────────────────

  async changeRole(
    carId: number,
    ownerGoogleId: string,
    targetUserId: number,
    dto: ChangeRoleDto,
  ): Promise<CarAccessDto> {
    const owner = await this.resolveUser(ownerGoogleId);
    const car = await this.assertOwner(carId, owner.id);

    if (dto.role === CarAccessRole.OWNER) {
      throw new BadRequestException('Cannot assign OWNER role');
    }
    if (targetUserId === owner.id) {
      throw new ForbiddenException('Cannot change owner\'s role');
    }

    const entry = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: targetUserId } },
    });
    if (!entry) throw new NotFoundException('Access record not found');

    const updated = await this.prisma.carUserAccess.update({
      where: { car_id_user_id: { car_id: carId, user_id: targetUserId } },
      data: { role: dto.role },
      include: this.accessInclude,
    });

    // Recipient is the member whose role changed, not the owner — same rule
    // as removeAccess above. Always make+model.
    const carLabel = `${car.make} ${car.model}`.trim();
    await this.notificationsService.create(targetUserId, NotificationType.CAR_ACCESS_ROLE_CHANGED, {
      carId: car.id,
      carLabel,
      role: dto.role,
      changedByName: `${owner.first_name} ${owner.last_name}`.trim(),
    });

    return this.toAccessDto(updated);
  }

  // ── list access ────────────────────────────────────────────────────────

  async getAccessList(carId: number): Promise<CarAccessDto[]> {
    const car = await this.prisma.car.findUnique({
      where: { id: carId },
      include: { user: { select: { id: true, email: true, first_name: true, last_name: true, picture: true } } },
    });
    if (!car) throw new NotFoundException('Car not found');

    const entries = await this.prisma.carUserAccess.findMany({
      where: { car_id: carId },
      include: this.accessInclude,
    });

    // Prepend a synthetic OWNER entry for the car's original owner
    const ownerEntry: CarAccessDto = {
      id: 0,
      car_id: carId,
      role: CarAccessRole.OWNER,
      user: car.user as any,
      invited_by: car.user as any,
      accepted_at: car.user['created_at'] ?? null,
      created_at: car.user['created_at'] ?? new Date(),
    };

    return [ownerEntry, ...entries.map(e => this.toAccessDto(e))];
  }

  // ── resolve role (used by other services) ─────────────────────────────

  async resolveUserRole(carId: number, googleId: string): Promise<CarAccessRole> {
    const user = await this.resolveUser(googleId);
    return this.resolveUserRoleById(carId, user.id);
  }

  /**
   * Same resolution as `resolveUserRole`, keyed by the already-resolved numeric
   * user id (every `RequestWithUser` carries one) rather than `google_id` — avoids
   * a redundant user lookup for callers that already have it from the JWT.
   */
  async resolveUserRoleById(carId: number, userId: number): Promise<CarAccessRole> {
    const car = await this.prisma.car.findUnique({ where: { id: carId } });
    if (!car) throw new NotFoundException('Car not found');

    // The session context decides which cars exist for this request at all:
    // personal -> only cars with organization_id NULL; business -> only the
    // active organization's cars. `undefined` = not inside an HTTP request
    // (internal/system caller), which is not context-restricted.
    const ctx = getRequestSessionContext();

    if (ctx?.type === 'business') {
      if (ctx.orgId == null || car.organization_id !== ctx.orgId) {
        throw new ForbiddenException('No access to this car');
      }
      return this.resolveOrgCarRole(car, userId, ctx.orgRole);
    }
    if (ctx?.type === 'personal' && car.organization_id != null) {
      throw new ForbiddenException('No access to this car');
    }

    if (car.user_id === userId) return CarAccessRole.OWNER;

    const access = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: userId } },
    });
    if (access?.accepted_at) return access.role;

    // No request context (internal caller) on an org-owned car: same membership rule as business.
    if (!ctx && car.organization_id != null) return this.resolveOrgCarRole(car, userId);

    throw new ForbiddenException('No access to this car');
  }

  /**
   * Role on an organization-owned car, for a user acting in that organization.
   * Any accepted member gets FULL-equivalent car access, *except* a DRIVER —
   * they're scoped to only the car(s) they're currently assigned to
   * (CarDriverAssignment, ended_at: null), mapped to MAINTENANCE (their comment
   * in the OrganizationRole enum: "log fuel/mileage, flag issues"). The car's
   * creator keeps OWNER unless they are now a DRIVER. Personal `CarUserAccess`
   * rows are deliberately ignored here: business access comes from membership
   * only. This only governs car-level CRUD, not organization management.
   * `knownRole` is the fresh role the request interceptor already loaded.
   */
  private async resolveOrgCarRole(car: Car, userId: number, knownRole?: OrganizationRole): Promise<CarAccessRole> {
    let role = knownRole;
    if (!role) {
      const membership = await this.prisma.organizationMembership.findUnique({
        where: { organization_id_user_id: { organization_id: car.organization_id!, user_id: userId } },
      });
      if (!membership?.accepted_at) throw new ForbiddenException('No access to this car');
      role = membership.role;
    }

    if (role === OrganizationRole.DRIVER) {
      const assignment = await this.prisma.carDriverAssignment.findFirst({
        where: { car_id: car.id, driver_user_id: userId, ended_at: null },
      });
      if (assignment) return CarAccessRole.MAINTENANCE;
      throw new ForbiddenException('No access to this car');
    }
    return car.user_id === userId ? CarAccessRole.OWNER : CarAccessRole.FULL;
  }

  /**
   * Throws unless the user can access the car in the current session context
   * (see `resolveUserRoleById`: owner / accepted `CarUserAccess` row of any role
   * in personal, organization membership in business) — the single check that closes the "any authenticated user can
   * touch any car-scoped record by guessing its id" gap. No role ranking here:
   * today every role can read/write a car's notes/wishes/maintenance/documents
   * once they have *any* accepted access, same as before this check existed —
   * this only blocks someone with no relationship to the car at all.
   */
  async assertHasAccess(carId: number, userId: number): Promise<void> {
    await this.resolveUserRoleById(carId, userId);
  }

  /**
   * All car ids the user can see IN THE CURRENT SESSION CONTEXT — the single
   * place this is computed; callers must use it instead of re-deriving an
   * OR-clause locally. Personal: their own cars plus cars shared with them via
   * an accepted `CarUserAccess` row, restricted to cars with
   * `organization_id` NULL. Business: only the active organization's cars (a
   * DRIVER only sees the car(s) they're currently assigned to — see
   * `resolveOrgCarRole`). Outside an HTTP request (no context) the legacy
   * union across personal + all accepted organizations is returned.
   */
  async getAccessibleCarIds(userId: number): Promise<number[]> {
    const ctx = getRequestSessionContext();

    if (ctx?.type === 'business') {
      return ctx.orgId == null ? [] : this.getOrgCarIds(userId, ctx.orgId, ctx.orgRole);
    }
    if (ctx?.type === 'personal') {
      const cars = await this.prisma.car.findMany({
        where: {
          organization_id: null,
          OR: [
            { user_id: userId },
            { access_entries: { some: { user_id: userId, accepted_at: { not: null } } } },
          ],
        },
        select: { id: true },
      });
      return cars.map(c => c.id);
    }

    const memberships = await this.prisma.organizationMembership.findMany({
      where: { user_id: userId, accepted_at: { not: null } },
      select: { organization_id: true, role: true },
    });
    const ids = new Set<number>(await this.getAccessibleCarIdsOutsideRequest(userId));
    for (const m of memberships) {
      (await this.getOrgCarIds(userId, m.organization_id, m.role)).forEach(id => ids.add(id));
    }
    return [...ids];
  }

  private async getAccessibleCarIdsOutsideRequest(userId: number): Promise<number[]> {
    const cars = await this.prisma.car.findMany({
      where: {
        OR: [
          { user_id: userId },
          { access_entries: { some: { user_id: userId, accepted_at: { not: null } } } },
        ],
      },
      select: { id: true },
    });
    return cars.map(c => c.id);
  }

  /** Cars of one organization visible to a member: everything for non-drivers, only current assignments for a DRIVER. */
  private async getOrgCarIds(userId: number, organizationId: number, knownRole?: OrganizationRole): Promise<number[]> {
    let role = knownRole;
    if (!role) {
      const membership = await this.prisma.organizationMembership.findUnique({
        where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
      });
      if (!membership?.accepted_at) return [];
      role = membership.role;
    }
    const cars = await this.prisma.car.findMany({
      where: {
        organization_id: organizationId,
        ...(role === OrganizationRole.DRIVER
          ? { driver_assignments: { some: { driver_user_id: userId, ended_at: null } } }
          : {}),
      },
      select: { id: true },
    });
    return cars.map(c => c.id);
  }

  // ── leave (shared user removes themselves) ─────────────────────────────

  async leaveAccess(carId: number, googleId: string): Promise<void> {
    const user = await this.resolveUser(googleId);
    const car = await this.prisma.car.findUnique({ where: { id: carId } });
    if (!car) throw new NotFoundException('Car not found');
    if (car.user_id === user.id) throw new ForbiddenException('Owner cannot leave their own car');

    const access = await this.prisma.carUserAccess.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: user.id } },
    });
    if (!access) throw new NotFoundException('Access record not found');

    await this.prisma.carUserAccess.delete({
      where: { car_id_user_id: { car_id: carId, user_id: user.id } },
    });
  }

  // ── shared cars ────────────────────────────────────────────────────────

  /**
   * Every car shared with this user PERSONALLY (accepted + pending invites) —
   * the Garage's "Shared with me" section. Personal context only: in business
   * context this is always empty (business access is membership/driver
   * assignment, shown in the fleet list), and organization-owned cars never
   * appear here, even if an old `CarUserAccess` row exists for them. The
   * `organization_id`/`organization_name` fields of SharedCarDto are kept for
   * API compatibility and are always null now.
   */
  async getSharedCars(googleId: string): Promise<SharedCarDto[]> {
    const user = await this.resolveUser(googleId);

    if (getRequestSessionContext()?.type === 'business') return [];

    const carSelect = { id: true, make: true, model: true, variant: true, year: true, license_plate: true };

    const entries = await this.prisma.carUserAccess.findMany({
      where: { user_id: user.id, car: { organization_id: null } },
      include: { car: { select: carSelect } },
    });

    return entries.map(e => ({
      id: e.car.id,
      make: e.car.make,
      model: e.car.model,
      variant: e.car.variant,
      year: e.car.year,
      license_plate: e.car.license_plate,
      shared_role: e.role,
      accepted_at: e.accepted_at,
      organization_id: null,
      organization_name: null,
    }));
  }

  // ── organizations (B2B) ────────────────────────────────────────────────

  /** All organization ids a user is an accepted member of — the same resolution other org-scoped modules (suppliers, cost dashboard) should reuse rather than re-querying `OrganizationMembership` themselves. */
  async getAcceptedOrganizationIds(userId: number): Promise<number[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { user_id: userId, accepted_at: { not: null } },
      select: { organization_id: true },
    });
    return memberships.map(m => m.organization_id);
  }
}
