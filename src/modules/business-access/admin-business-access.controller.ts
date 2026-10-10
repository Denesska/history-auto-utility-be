import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BusinessAccessRequestStatus } from '@prisma/client';
import { Scope } from '../../common/context/scope.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { AdminGuard } from '../admin/admin.guard';
import { BusinessAccessService } from './business-access.service';
import { AdminBusinessAccessRequestDto } from './dto/admin-business-access-request.dto';
import { RejectBusinessAccessRequestDto } from './dto/reject-business-access-request.dto';

const STATUS_VALUES = Object.values(BusinessAccessRequestStatus);

/** App-admin review screen for BusinessAccessRequest — same controller shape/guard as AdminController. */
@ApiTags('admin')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Scope('personal')
@Controller('admin/business-access-requests')
export class AdminBusinessAccessController {
  constructor(private readonly businessAccessService: BusinessAccessService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List business access requests by status (default PENDING), newest first' })
  @ApiResponse({ status: 200, type: [AdminBusinessAccessRequestDto] })
  list(@Query('status') status?: string): Promise<AdminBusinessAccessRequestDto[]> {
    const value = status ?? BusinessAccessRequestStatus.PENDING;
    if (!STATUS_VALUES.includes(value as BusinessAccessRequestStatus)) {
      throw new BadRequestException(`status must be one of ${STATUS_VALUES.join(', ')}`);
    }
    return this.businessAccessService.listRequests(value as BusinessAccessRequestStatus);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Approve a pending business access request' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, type: AdminBusinessAccessRequestDto })
  approve(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser): Promise<AdminBusinessAccessRequestDto> {
    return this.businessAccessService.approve(id, req.user.id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Reject a pending business access request, with an optional reason shown to the requester' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, type: AdminBusinessAccessRequestDto })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
    @Body() dto: RejectBusinessAccessRequestDto,
  ): Promise<AdminBusinessAccessRequestDto> {
    return this.businessAccessService.reject(id, req.user.id, dto);
  }
}
