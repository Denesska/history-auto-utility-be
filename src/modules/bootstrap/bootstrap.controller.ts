import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { BootstrapService } from './bootstrap.service';
import { BootstrapResponseDto } from './dto/bootstrap-response.dto';

@ApiTags('app-data')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('app-data')
export class BootstrapController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  @Get('initial')
  @ApiOperation({ summary: 'Fetch all initial data needed on app load in a single request' })
  getInitialData(@Req() req: RequestWithUser): Promise<BootstrapResponseDto> {
    return this.bootstrapService.getInitialData(req.user.google_id);
  }
}
