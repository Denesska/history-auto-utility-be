import { Scope } from '../../common/context/scope.decorator';
import { CurrentContext } from '../../common/context/current-context.decorator';
import { SessionContext } from '../../common/context/session-context';
import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { UserSettingsService } from './user-settings.service';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { UserSettingsDto } from './dto/user-settings.dto';
import { UpdateNavigationPrefsDto } from './dto/update-navigation-prefs.dto';
import { NavigationPrefsDto } from './dto/navigation-prefs.dto';
import { SkipLegalConsent } from '../legal/skip-legal-consent.decorator';

@ApiTags('user-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Scope('any')
@Controller('user-settings')
export class UserSettingsController {
    constructor(private readonly userSettingsService: UserSettingsService) {}

    // Exempted from the legal-acceptance gate: the consent screen itself may need to
    // change the user's language before they've accepted (see LegalEnforcementInterceptor).
    @Get()
    @SkipLegalConsent()
    @ApiOperation({ summary: 'Get the current user settings' })
    @ApiResponse({ status: 200, type: UserSettingsDto })
    getSettings(@Req() req: RequestWithUser): Promise<UserSettingsDto> {
        return this.userSettingsService.getSettings(req.user.id);
    }

    @Put()
    @SkipLegalConsent()
    @ApiOperation({ summary: 'Update the current user settings' })
    @ApiResponse({ status: 200, type: UserSettingsDto })
    updateSettings(
        @Req() req: RequestWithUser,
        @Body() dto: UpdateUserSettingsDto,
    ): Promise<UserSettingsDto> {
        return this.userSettingsService.updateSettings(req.user.id, dto);
    }

    // Business with no organization picked yet is allowed through (allowNoOrg)
    // so the frontend can always call these; the service returns nulls / 400s
    // for that case instead of the global "NO_ORGANIZATION_SELECTED" rejection.
    @Get('navigation')
    @Scope('any', { allowNoOrg: true })
    @ApiOperation({ summary: "Get the current session context's navigation preferences (bottom bar, favorite car)" })
    @ApiResponse({ status: 200, type: NavigationPrefsDto })
    getNavigation(
        @Req() req: RequestWithUser,
        @CurrentContext() ctx: SessionContext,
    ): Promise<NavigationPrefsDto> {
        return this.userSettingsService.getNavigationPrefs(req.user.id, ctx);
    }

    @Put('navigation')
    @Scope('any', { allowNoOrg: true })
    @ApiOperation({ summary: "Update the current session context's navigation preferences" })
    @ApiResponse({ status: 200, type: NavigationPrefsDto })
    updateNavigation(
        @Req() req: RequestWithUser,
        @CurrentContext() ctx: SessionContext,
        @Body() dto: UpdateNavigationPrefsDto,
    ): Promise<NavigationPrefsDto> {
        return this.userSettingsService.updateNavigationPrefs(req.user.id, ctx, dto);
    }
}
