import { Feature } from '../../common/features/feature.decorator';
import { Scope } from '../../common/context/scope.decorator';
import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrganizationGuard } from '../../common/guards/organization/organization.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { FleetCostService } from './fleet-cost.service';
import { FLEET_COST_RANGES, FleetCostDashboardDto, FleetCostRange } from './dto/fleet-cost.dto';

@ApiTags('fleet-cost')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrganizationGuard)
@Scope('business')
@Feature('fleet_cost')
@Controller('organization/:organizationId/cost-dashboard')
export class FleetCostController {
  constructor(private readonly fleetCostService: FleetCostService) {}

  @Get()
  @ApiOperation({ summary: 'Fleet-wide maintenance cost totals, monthly trend, and per-car breakdown' })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiQuery({ name: 'range', type: Number, required: false, description: 'Days to look back; 0 = all time. Default 90.' })
  @ApiResponse({ status: 200, type: FleetCostDashboardDto })
  getDashboard(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Req() req: RequestWithUser,
    @Query('range', new ParseIntPipe({ optional: true })) range = 90,
  ): Promise<FleetCostDashboardDto> {
    if (!(FLEET_COST_RANGES as readonly number[]).includes(range)) {
      throw new BadRequestException(`range must be one of ${FLEET_COST_RANGES.join(', ')}`);
    }
    return this.fleetCostService.getDashboard(organizationId, req.user.id, range as FleetCostRange);
  }
}
