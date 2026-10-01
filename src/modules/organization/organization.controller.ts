import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrganizationGuard } from '../../common/guards/organization/organization.guard';
import { RequiredOrgRole } from '../../common/decorators/required-org-role.decorator';
import { RequestWithUser } from '../auth/express-request.interface';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { ChangeMemberRoleDto } from './dto/change-member-role.dto';
import { MyOrganizationDto, OrganizationMembershipDto } from './dto/organization.dto';

@ApiTags('organization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new organization; the creator becomes its SUPER_ADMIN' })
  @ApiResponse({ status: 201, type: MyOrganizationDto })
  createOrganization(@Req() req: RequestWithUser, @Body() dto: CreateOrganizationDto): Promise<MyOrganizationDto> {
    return this.organizationService.createOrganization(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List every organization the current user belongs to (pending invites included)' })
  @ApiResponse({ status: 200, type: [MyOrganizationDto] })
  getMyOrganizations(@Req() req: RequestWithUser): Promise<MyOrganizationDto[]> {
    return this.organizationService.getMyOrganizations(req.user.id);
  }

  @Get(':organizationId/members')
  @UseGuards(OrganizationGuard)
  @ApiOperation({ summary: 'List every member of an organization' })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiResponse({ status: 200, type: [OrganizationMembershipDto] })
  getMembers(@Param('organizationId', ParseIntPipe) organizationId: number): Promise<OrganizationMembershipDto[]> {
    return this.organizationService.getMembers(organizationId);
  }

  @Post(':organizationId/members/invite')
  @UseGuards(OrganizationGuard)
  @RequiredOrgRole(OrganizationRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Invite a registered user to the organization with a role' })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiResponse({ status: 201, type: OrganizationMembershipDto })
  inviteMember(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Req() req: RequestWithUser,
    @Body() dto: InviteMemberDto,
  ): Promise<OrganizationMembershipDto> {
    return this.organizationService.inviteMember(organizationId, req.user.id, dto);
  }

  @Post(':organizationId/members/accept')
  @ApiOperation({ summary: 'Accept a pending invitation to an organization' })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiResponse({ status: 200, type: OrganizationMembershipDto })
  acceptInvitation(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Req() req: RequestWithUser,
  ): Promise<OrganizationMembershipDto> {
    return this.organizationService.acceptInvitation(organizationId, req.user.id);
  }

  @Patch(':organizationId/members/:targetUserId/role')
  @UseGuards(OrganizationGuard)
  @RequiredOrgRole(OrganizationRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Change the role of a member' })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiParam({ name: 'targetUserId', type: Number })
  @ApiResponse({ status: 200, type: OrganizationMembershipDto })
  changeRole(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Param('targetUserId', ParseIntPipe) targetUserId: number,
    @Body() dto: ChangeMemberRoleDto,
  ): Promise<OrganizationMembershipDto> {
    return this.organizationService.changeRole(organizationId, targetUserId, dto);
  }

  @Delete(':organizationId/members/leave')
  @HttpCode(204)
  @ApiOperation({ summary: 'Leave (remove yourself from) an organization' })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiResponse({ status: 204, description: 'Membership removed' })
  leaveOrganization(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    return this.organizationService.leaveOrganization(organizationId, req.user.id);
  }

  @Delete(':organizationId/members/:targetUserId')
  @HttpCode(204)
  @UseGuards(OrganizationGuard)
  @RequiredOrgRole(OrganizationRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Remove a member from the organization' })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiParam({ name: 'targetUserId', type: Number })
  @ApiResponse({ status: 204, description: 'Membership removed' })
  removeMember(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Param('targetUserId', ParseIntPipe) targetUserId: number,
  ): Promise<void> {
    return this.organizationService.removeMember(organizationId, targetUserId);
  }
}
