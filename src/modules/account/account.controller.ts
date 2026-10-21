import { Body, Controller, Delete, Get, HttpCode, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { Scope } from '../../common/context/scope.decorator';
import { AccountService } from './account.service';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { SkipLegalConsent } from '../legal/skip-legal-consent.decorator';

// A user must be able to exercise these GDPR rights (export / delete their own
// data) even if they haven't accepted the current terms/privacy policy yet.
@SkipLegalConsent()
@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Scope('any', { allowNoOrg: true })
@Controller('account')
export class AccountController {
  private readonly cookieConfig: Record<string, unknown>;

  constructor(
    private readonly accountService: AccountService,
    private readonly configService: ConfigService,
  ) {
    // Same shape AuthController uses for the access_token cookie (that
    // controller isn't touched by this module, so this is kept in sync by hand).
    this.cookieConfig = {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      domain: this.configService.get<string>('COOKIE_DOMAIN', 'api.denhau.ro'),
    };
  }

  @Get('export')
  @ApiOperation({ summary: 'Download all personal data held about the calling user (GDPR Art. 15/20)' })
  @ApiResponse({ status: 200, description: 'A JSON file download.' })
  async exportMyData(@Req() req: RequestWithUser, @Res({ passthrough: true }) res: Response): Promise<Record<string, unknown>> {
    const data = await this.accountService.exportMyData(req.user.id);
    const fileName = `hau-export-${new Date().toISOString().slice(0, 10)}.json`;
    res.set({
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });
    return data;
  }

  @Delete()
  @HttpCode(200)
  @ApiOperation({ summary: "Permanently delete the calling user's account and personal data (GDPR Art. 17)" })
  @ApiResponse({ status: 200, description: 'Account deleted.' })
  @ApiResponse({ status: 400, description: 'ACCOUNT_DELETE_CONFIRMATION_MISMATCH' })
  @ApiResponse({ status: 403, description: 'ACCOUNT_COMPANY_MANAGED' })
  @ApiResponse({ status: 409, description: 'ACCOUNT_OWNS_ORGANIZATION' })
  async deleteMyAccount(
    @Req() req: RequestWithUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ deleted: true }> {
    await this.accountService.deleteMyAccount(req.user.id, dto.confirmation);
    res.clearCookie('access_token', { ...this.cookieConfig, maxAge: 0 });
    return { deleted: true };
  }
}
