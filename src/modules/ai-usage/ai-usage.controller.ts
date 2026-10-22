import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Scope } from '../../common/context/scope.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { AiUsageService, MyAiUsage } from './ai-usage.service';

@ApiTags('ai-usage')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai-usage')
export class AiUsageController {
  constructor(private readonly service: AiUsageService) {}

  // Quotas are per person, not per context.
  @Get('me')
  @Scope('any')
  @ApiOperation({ summary: "Current user's AI usage against daily/monthly budgets" })
  me(@Req() req: RequestWithUser): Promise<MyAiUsage> {
    return this.service.getMyUsage(req.user.id);
  }
}
