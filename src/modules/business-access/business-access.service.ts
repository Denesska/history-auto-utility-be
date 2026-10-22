import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessAccessRequest, BusinessAccessRequestStatus, NotificationType, OrganizationRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { MailLang, resolveMailLang } from '../mail/templates/base-email.template';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateBusinessAccessRequestDto } from './dto/create-business-access-request.dto';
import { RejectBusinessAccessRequestDto } from './dto/reject-business-access-request.dto';
import { BusinessAccessRequestSummaryDto, BusinessAccessStatusDto } from './dto/business-access-status.dto';
import { AdminBusinessAccessRequestDto } from './dto/admin-business-access-request.dto';

/** Director-tier roles whose existing accepted membership "grandfathers in" the right to create another organization. */
const GRANDFATHERED_ROLES: ReadonlySet<OrganizationRole> = new Set([OrganizationRole.OWNER, OrganizationRole.SUPER_ADMIN]);

@Injectable()
export class BusinessAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  private toSummaryDto(request: BusinessAccessRequest): BusinessAccessRequestSummaryDto {
    return {
      id: request.id,
      company_name: request.company_name,
      note: request.note,
      rejection_reason: request.rejection_reason,
      created_at: request.created_at,
      decided_at: request.decided_at,
    };
  }

  private userDto(user: { id: number; first_name: string; last_name: string; email: string; picture: string | null }) {
    return { id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email, picture: user.picture };
  }

  private toAdminDto(request: BusinessAccessRequest & {
    user: { id: number; first_name: string; last_name: string; email: string; picture: string | null };
    decided_by: { id: number; first_name: string; last_name: string; email: string; picture: string | null } | null;
  }): AdminBusinessAccessRequestDto {
    return {
      id: request.id,
      company_name: request.company_name,
      note: request.note,
      status: request.status,
      rejection_reason: request.rejection_reason,
      created_at: request.created_at,
      decided_at: request.decided_at,
      user: this.userDto(request.user),
      decided_by: request.decided_by ? this.userDto(request.decided_by) : null,
    };
  }

  /**
   * "Allowed to create an organization" rule: app admin, OR already a Director-tier
   * (OWNER/SUPER_ADMIN) accepted member of some existing organization, OR latest
   * BusinessAccessRequest is APPROVED. Shared by getMyStatus and the createOrganization gate.
   */
  private async isAllowed(userId: number, latestRequest: BusinessAccessRequest | null): Promise<boolean> {
    if (latestRequest?.status === BusinessAccessRequestStatus.APPROVED) return true;

    const [user, grandfathered] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { is_admin: true } }),
      this.prisma.organizationMembership.findFirst({
        where: { user_id: userId, role: { in: [...GRANDFATHERED_ROLES] }, accepted_at: { not: null } },
        select: { id: true },
      }),
    ]);

    return !!user?.is_admin || !!grandfathered;
  }

  private async latestRequestFor(userId: number): Promise<BusinessAccessRequest | null> {
    return this.prisma.businessAccessRequest.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
  }

  async getMyStatus(userId: number): Promise<BusinessAccessStatusDto> {
    const latestRequest = await this.latestRequestFor(userId);
    const allowed = await this.isAllowed(userId, latestRequest);

    return {
      status: allowed ? 'APPROVED' : (latestRequest?.status ?? 'NONE'),
      canCreateOrganization: allowed,
      request: latestRequest ? this.toSummaryDto(latestRequest) : null,
    };
  }

  /** Used by OrganizationService.createOrganization — throws, doesn't just return a boolean. */
  async assertCanCreateOrganization(userId: number): Promise<void> {
    const latestRequest = await this.latestRequestFor(userId);
    const allowed = await this.isAllowed(userId, latestRequest);
    if (!allowed) {
      throw new ForbiddenException({
        code: 'BUSINESS_ACCESS_REQUIRED',
        message: 'You need an approved business access request before you can create an organization',
      });
    }
  }

  async submitRequest(userId: number, dto: CreateBusinessAccessRequestDto): Promise<BusinessAccessStatusDto> {
    const latestRequest = await this.latestRequestFor(userId);
    const allowed = await this.isAllowed(userId, latestRequest);
    if (allowed) {
      throw new ConflictException({ code: 'BUSINESS_ACCESS_ALREADY_ALLOWED', message: 'You can already create an organization' });
    }
    if (latestRequest?.status === BusinessAccessRequestStatus.PENDING) {
      throw new ConflictException({ code: 'BUSINESS_ACCESS_REQUEST_PENDING', message: 'You already have a pending request' });
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const request = await this.prisma.businessAccessRequest.create({
      data: {
        user_id: userId,
        company_name: dto.company_name.trim(),
        note: dto.note?.trim() || null,
      },
    });

    const admins = await this.prisma.user.findMany({
      where: { is_admin: true },
      select: { id: true },
    });
    const requesterName = `${user.first_name} ${user.last_name}`.trim();

    // In-app notification first (fast, realtime), same ordering rationale as
    // OrganizationService.inviteMember — the email is a slower SMTP round-trip.
    await Promise.all(
      admins.map(admin =>
        this.notificationsService.create(admin.id, NotificationType.BUSINESS_ACCESS_REQUESTED, {
          requestId: request.id,
          company_name: request.company_name,
          userName: requesterName,
          userEmail: user.email,
        }),
      ),
    );

    const appUrl = this.configService.get<string>('FE_BASE_URL', 'http://localhost:4200');
    const recipients = this.configService
      .get<string>('BUSINESS_ACCESS_NOTIFY_EMAILS', 'office@denhau.ro,denis.gandzii@gmail.com')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    // Each recipient gets the alert in their own language: looked up by email, en when the address isn't a user (e.g. a shared inbox).
    const recipientUsers = await this.prisma.user.findMany({
      where: { email: { in: recipients } },
      select: { email: true, settings: { select: { language: true } } },
    });
    const langByEmail = new Map(recipientUsers.map(u => [u.email.toLowerCase(), resolveMailLang(u.settings?.language)]));
    const adminRecipients = recipients.map(to => ({ to, lang: langByEmail.get(to.toLowerCase()) ?? resolveMailLang(null) }));
    await Promise.all(
      adminRecipients.map(({ to, lang }) =>
        this.mailService.sendBusinessAccessRequested(to, lang, {
          requesterName,
          requesterEmail: user.email,
          companyName: request.company_name,
          note: request.note,
          appUrl,
        }),
      ),
    );

    return this.getMyStatus(userId);
  }

  async listRequests(status: BusinessAccessRequestStatus): Promise<AdminBusinessAccessRequestDto[]> {
    const rows = await this.prisma.businessAccessRequest.findMany({
      where: { status },
      orderBy: { created_at: 'desc' },
      include: {
        user: { select: { id: true, first_name: true, last_name: true, email: true, picture: true } },
        decided_by: { select: { id: true, first_name: true, last_name: true, email: true, picture: true } },
      },
    });
    return rows.map(r => this.toAdminDto(r));
  }

  private async findPendingOrThrow(id: number) {
    const request = await this.prisma.businessAccessRequest.findUnique({
      where: { id },
      include: { user: { include: { settings: true } } },
    });
    if (!request) throw new NotFoundException('Business access request not found');
    if (request.status !== BusinessAccessRequestStatus.PENDING) {
      throw new ConflictException({ code: 'BUSINESS_ACCESS_REQUEST_NOT_PENDING', message: 'This request was already decided' });
    }
    return request;
  }

  async approve(id: number, adminUserId: number): Promise<AdminBusinessAccessRequestDto> {
    const request = await this.findPendingOrThrow(id);

    await this.prisma.businessAccessRequest.update({
      where: { id },
      data: { status: BusinessAccessRequestStatus.APPROVED, decided_by_user_id: adminUserId, decided_at: new Date() },
    });

    await this.notificationsService.create(request.user_id, NotificationType.BUSINESS_ACCESS_APPROVED, {
      requestId: id,
      company_name: request.company_name,
    });

    const lang: MailLang = resolveMailLang(request.user.settings?.language);
    await this.mailService.sendBusinessAccessApproved(request.user.email, lang, {
      companyName: request.company_name,
      appUrl: this.configService.get<string>('FE_BASE_URL', 'http://localhost:4200'),
    });

    return this.getAdminDto(id);
  }

  async reject(id: number, adminUserId: number, dto: RejectBusinessAccessRequestDto): Promise<AdminBusinessAccessRequestDto> {
    const request = await this.findPendingOrThrow(id);
    const reason = dto.reason?.trim() || null;

    await this.prisma.businessAccessRequest.update({
      where: { id },
      data: {
        status: BusinessAccessRequestStatus.REJECTED,
        rejection_reason: reason,
        decided_by_user_id: adminUserId,
        decided_at: new Date(),
      },
    });

    await this.notificationsService.create(request.user_id, NotificationType.BUSINESS_ACCESS_REJECTED, {
      requestId: id,
      company_name: request.company_name,
      reason,
    });

    const lang: MailLang = resolveMailLang(request.user.settings?.language);
    await this.mailService.sendBusinessAccessRejected(request.user.email, lang, {
      companyName: request.company_name,
      reason,
      appUrl: this.configService.get<string>('FE_BASE_URL', 'http://localhost:4200'),
    });

    return this.getAdminDto(id);
  }

  private async getAdminDto(id: number): Promise<AdminBusinessAccessRequestDto> {
    const request = await this.prisma.businessAccessRequest.findUniqueOrThrow({
      where: { id },
      include: {
        user: { select: { id: true, first_name: true, last_name: true, email: true, picture: true } },
        decided_by: { select: { id: true, first_name: true, last_name: true, email: true, picture: true } },
      },
    });
    return this.toAdminDto(request);
  }
}
