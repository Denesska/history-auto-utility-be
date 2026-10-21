import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Scope } from '../../common/context/scope.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { AcceptLegalDto } from './dto/accept-legal.dto';
import { LegalStatusDto } from './dto/legal-status.dto';
import { LegalService } from './legal.service';
import { SkipLegalConsent } from './skip-legal-consent.decorator';

/** GDPR terms/privacy acceptance — status check and the accept action itself; see LegalEnforcementInterceptor for the enforcement side. */
@ApiTags('legal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Scope('any', { allowNoOrg: true })
@SkipLegalConsent()
@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Get('status')
  @ApiOperation({ summary: "Current user's legal-acceptance status (current vs. accepted terms/privacy versions)" })
  @ApiResponse({ status: 200, type: LegalStatusDto })
  getStatus(@Req() req: RequestWithUser): Promise<LegalStatusDto> {
    return this.legalService.getStatus(req.user.id);
  }

  @Post('accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept the current terms + privacy policy versions' })
  @ApiResponse({ status: 200, type: LegalStatusDto })
  @ApiResponse({ status: 409, description: 'LEGAL_VERSION_OUTDATED — the accepted version is no longer current.' })
  accept(@Req() req, @Body() dto: AcceptLegalDto): Promise<LegalStatusDto> {
    return this.legalService.accept(req.user.id, dto, this.extractIp(req), this.extractUserAgent(req));
  }

  // The app is behind nginx (no `trust proxy` set on the Express app, so
  // `req.ip` is nginx's own address, not the real client) — read the first
  // X-Forwarded-For entry instead, falling back to req.ip if it's absent.
  private extractIp(req): string | null {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip ?? null;
  }

  private extractUserAgent(req): string | null {
    const ua = req.headers?.['user-agent'];
    return typeof ua === 'string' ? ua : null;
  }
}
