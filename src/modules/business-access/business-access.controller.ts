import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Scope } from '../../common/context/scope.decorator';
import { RequestWithUser } from '../auth/express-request.interface';
import { BusinessAccessService } from './business-access.service';
import { CreateBusinessAccessRequestDto } from './dto/create-business-access-request.dto';
import { BusinessAccessStatusDto } from './dto/business-access-status.dto';

/**
 * User-facing side of the "business account approval gate" (see
 * OrganizationService.createOrganization, which enforces it). Same scope as
 * organization creation/the org picker — a business login with no organization
 * selected yet must be able to call both of these.
 */
@ApiTags('business-access')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Scope('business', { allowNoOrg: true })
@Controller('business-access')
export class BusinessAccessController {
  constructor(private readonly businessAccessService: BusinessAccessService) {}

  @Get('me')
  @ApiOperation({ summary: "Current user's business access status and whether they can create an organization" })
  @ApiResponse({ status: 200, type: BusinessAccessStatusDto })
  getMyStatus(@Req() req: RequestWithUser): Promise<BusinessAccessStatusDto> {
    return this.businessAccessService.getMyStatus(req.user.id);
  }

  @Post('request')
  @ApiOperation({ summary: 'Submit a request to be allowed to create an organization (company name + optional note)' })
  @ApiResponse({ status: 201, type: BusinessAccessStatusDto })
  submitRequest(@Req() req: RequestWithUser, @Body() dto: CreateBusinessAccessRequestDto): Promise<BusinessAccessStatusDto> {
    return this.businessAccessService.submitRequest(req.user.id, dto);
  }
}
