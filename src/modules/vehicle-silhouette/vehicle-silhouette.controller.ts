import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Scope } from '../../common/context/scope.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { AdminGuard } from '../admin/admin.guard';
import { VehicleSilhouetteResult, VehicleSilhouetteService } from './vehicle-silhouette.service';

class RegenerateSilhouetteDto {
  make: string;
  model: string;
}

@ApiTags('vehicle-silhouette')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('vehicle-silhouette')
export class VehicleSilhouetteController {
  constructor(private readonly service: VehicleSilhouetteService) {}

  // Global shared asset: same content for personal and business sessions.
  @Get()
  @Scope('personal', 'business')
  @ApiOperation({ summary: 'Shared schematic silhouette for a make + model (generated on first request)' })
  get(
    @Req() req: RequestWithUser,
    @Query('make') make: string,
    @Query('model') model: string,
  ): Promise<VehicleSilhouetteResult> {
    return this.service.getOrTrigger(req.user.id, make, model);
  }

  @Post('regenerate')
  @Scope('personal')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'App admins only: regenerate a bad silhouette' })
  regenerate(@Req() req: RequestWithUser, @Body() body: RegenerateSilhouetteDto): Promise<VehicleSilhouetteResult> {
    return this.service.regenerate(body?.make, body?.model, req.user.id);
  }
}
