import { Scope } from '../../common/context/scope.decorator';
import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
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
  constructor(private readonly adminService: AdminService) {}

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
}
