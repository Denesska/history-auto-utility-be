import { DocumentRemindersService, RunSummary } from '../document-reminders/document-reminders.service';
import { MaintenanceRemindersService, RunSummary as MaintenanceRunSummary } from '../maintenance-reminders/maintenance-reminders.service';
import { Scope } from '../../common/context/scope.decorator';
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Post, Put, Param, ParseIntPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AdminAiUsageService } from './admin-ai-usage.service';
import { AiSettingsDto, AiUsageStatsDto, AiUserLimitDto, UpdateAiSettingsDto, UpdateAiUserLimitDto } from './dto/admin-ai.dto';
import { ADMIN_RANGES, AdminRange, AdminStatsDto, AdminUserRow } from './dto/admin-stats.dto';
import {
  AdminOrganizationDto,
  UpdateOrganizationFeaturesDto,
} from './dto/admin-organization.dto';

@ApiTags('admin')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Scope('personal')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminAiUsage: AdminAiUsageService,
    private readonly documentReminders: DocumentRemindersService,
    private readonly maintenanceReminders: MaintenanceRemindersService,
  ) {}

  /** Open to every signed-in user — the frontend uses it to decide whether to show the Admin entry. */
  @Get('me')
  // Harmless self-check (returns only the caller's own flag): the frontend may ask in any context.
  @Scope('any')
  @ApiOperation({ summary: 'Whether the current user can open the admin page' })
  me(@Req() req: RequestWithUser): Promise<{ isAdmin: boolean }> {
    return this.adminService.isAdmin(req.user.id);
  }

  @Get('stats')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Aggregated usage stats for the admin page' })
  stats(@Query('range', new ParseIntPipe({ optional: true })) range = 30): Promise<AdminStatsDto> {
    if (!(ADMIN_RANGES as readonly number[]).includes(range)) {
      throw new BadRequestException(`range must be one of ${ADMIN_RANGES.join(', ')}`);
    }
    return this.adminService.getStats(range as AdminRange);
  }

  @Get('users')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Per-user usage counts for the admin page (no user content)' })
  users(): Promise<AdminUserRow[]> {
    return this.adminService.getUsers();
  }

  @Get('organizations')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary:
      'Organizations with usage counts and effective feature flags, for the feature-switches admin screen',
  })
  organizations(): Promise<AdminOrganizationDto[]> {
    return this.adminService.getOrganizations();
  }

  @Patch('organizations/:id/features')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary:
      "Enable/disable feature switches for one organization's business sessions; takes effect immediately",
  })
  updateOrganizationFeatures(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrganizationFeaturesDto,
  ): Promise<AdminOrganizationDto> {
    return this.adminService.updateOrganizationFeatures(id, dto);
  }

  @Get('ai-usage')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'AI usage and cost statistics for the admin page' })
  aiUsage(@Query('days', new ParseIntPipe({ optional: true })) days = 30): Promise<AiUsageStatsDto> {
    if (days < 1 || days > 365) throw new BadRequestException('days must be between 1 and 365');
    return this.adminAiUsage.getStats(days);
  }

  @Get('ai-settings')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Global AI limit settings' })
  aiSettings(): Promise<AiSettingsDto> {
    return this.adminAiUsage.getSettings();
  }

  @Put('ai-settings')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update global AI limit settings' })
  updateAiSettings(@Body() dto: UpdateAiSettingsDto): Promise<AiSettingsDto> {
    return this.adminAiUsage.updateSettings(dto);
  }

  @Get('ai-users/:userId/limit')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Per-user AI limit override (null when using defaults)' })
  aiUserLimit(@Param('userId', ParseIntPipe) userId: number): Promise<AiUserLimitDto | null> {
    return this.adminAiUsage.getUserLimit(userId);
  }

  @Put('ai-users/:userId/limit')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create/replace a per-user AI limit override' })
  setAiUserLimit(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateAiUserLimitDto,
    @Req() req: RequestWithUser,
  ): Promise<AiUserLimitDto> {
    return this.adminAiUsage.setUserLimit(userId, dto, req.user.id);
  }

  @Delete('ai-users/:userId/limit')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Remove a per-user AI limit override (back to defaults)' })
  deleteAiUserLimit(@Param('userId', ParseIntPipe) userId: number): Promise<void> {
    return this.adminAiUsage.deleteUserLimit(userId);
  }

  /** Dry run only: nothing is sent or written. Real runs happen from the daily cron. */
  @Post('document-reminders/dry-run')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Dry-run the document expiry reminder job (optionally for a simulated date) and list who would be notified' })
  documentRemindersDryRun(@Body() body: { today?: string }): Promise<RunSummary> {
    const today = body?.today ? new Date(body.today) : undefined;
    if (today && Number.isNaN(today.getTime())) throw new BadRequestException('today must be an ISO date');
    return this.documentReminders.run({ dryRun: true, today });
  }

  /** Dry run only: nothing is sent or written. Real runs happen from the daily cron. */
  @Post('maintenance-reminders/dry-run')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Dry-run the maintenance-due reminder job (optionally for a simulated date) and list who would be notified' })
  maintenanceRemindersDryRun(@Body() body: { today?: string }): Promise<MaintenanceRunSummary> {
    const today = body?.today ? new Date(body.today) : undefined;
    if (today && Number.isNaN(today.getTime())) throw new BadRequestException('today must be an ISO date');
    return this.maintenanceReminders.run({ dryRun: true, today });
  }
}
