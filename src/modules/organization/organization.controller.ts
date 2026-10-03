import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrganizationGuard } from '../../common/guards/organization/organization.guard';
import { RequiredOrgRole } from '../../common/decorators/required-org-role.decorator';
import { Scope } from '../../common/context/scope.decorator';
import { RequestWithUser } from '../auth/express-request.interface';
import { OrganizationService } from './organization.service';
import { CarService } from '../car/car.service';
import { parseFleetImportFile } from '../car/fleet-import.util';
import { ImportCarsResultDto } from '../car/dto/import-cars-result.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { ChangeMemberRoleDto } from './dto/change-member-role.dto';
import { CreateLocalMemberDto } from './dto/create-local-member.dto';
import { CreateLocalMemberResultDto } from './dto/create-local-member-result.dto';
import { ResetLocalPasswordResultDto } from './dto/reset-local-password-result.dto';
import { MyOrganizationDto, OrganizationMembershipDto } from './dto/organization.dto';
import { UsernameAvailableDto, UsernameAvailableQueryDto, UsernameSuggestionDto, UsernameSuggestionQueryDto } from './dto/username-query.dto';
import { OrganizationCarDto } from './dto/organization-car.dto';

@ApiTags('organization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Scope('business')
@Controller('organization')
export class OrganizationController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly carService: CarService,
  ) {}

  @Post()
  @Scope('business', { allowNoOrg: true })
  @ApiOperation({ summary: 'Create a new organization; the creator becomes its SUPER_ADMIN' })
  @ApiResponse({ status: 201, type: MyOrganizationDto })
  createOrganization(@Req() req: RequestWithUser, @Body() dto: CreateOrganizationDto): Promise<MyOrganizationDto> {
    return this.organizationService.createOrganization(dto, req.user.id);
  }

  @Get()
  @Scope('business', { allowNoOrg: true })
  @ApiOperation({ summary: 'List every organization the current user belongs to (pending invites included)' })
  @ApiResponse({ status: 200, type: [MyOrganizationDto] })
  getMyOrganizations(@Req() req: RequestWithUser): Promise<MyOrganizationDto[]> {
    return this.organizationService.getMyOrganizations(req.user.id);
  }

  @Get(':organizationId/members')
  @UseGuards(OrganizationGuard)
  @ApiOperation({ summary: "List members of an organization visible to the caller (everyone below them in rank, never above — see OrganizationService.getMembers)" })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiResponse({ status: 200, type: [OrganizationMembershipDto] })
  getMembers(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Req() req: RequestWithUser,
  ): Promise<OrganizationMembershipDto[]> {
    return this.organizationService.getMembers(organizationId, req.user.id);
  }

  @Post(':organizationId/members/invite')
  @UseGuards(OrganizationGuard)
  @ApiOperation({ summary: 'Invite a registered user with a role the caller is allowed to assign (SUPER_ADMIN invites FLEET_ADMIN/FINANCE/DRIVER, FLEET_ADMIN invites only DRIVER — enforced in OrganizationService, not here)' })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiResponse({ status: 201, type: OrganizationMembershipDto })
  inviteMember(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Req() req: RequestWithUser,
    @Body() dto: InviteMemberDto,
  ): Promise<OrganizationMembershipDto> {
    return this.organizationService.inviteMember(organizationId, req.user.id, dto);
  }

  @Get(':organizationId/members/username-suggestion')
  @UseGuards(OrganizationGuard)
  @ApiOperation({ summary: 'Suggest a free, globally-unique username for a new company-managed account from the typed first/last name' })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiResponse({ status: 200, type: UsernameSuggestionDto })
  usernameSuggestion(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Req() req: RequestWithUser,
    @Query() query: UsernameSuggestionQueryDto,
  ): Promise<UsernameSuggestionDto> {
    return this.organizationService.suggestUsername(organizationId, req.user.id, query.firstName, query.lastName);
  }

  @Get(':organizationId/members/username-available')
  @UseGuards(OrganizationGuard)
  @ApiOperation({ summary: 'Whether a username is free (global); 400 when the format is invalid' })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiResponse({ status: 200, type: UsernameAvailableDto })
  usernameAvailable(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Req() req: RequestWithUser,
    @Query() query: UsernameAvailableQueryDto,
  ): Promise<UsernameAvailableDto> {
    return this.organizationService.isUsernameAvailable(organizationId, req.user.id, query.username);
  }

  @Post(':organizationId/members/local')
  @UseGuards(OrganizationGuard)
  @ApiOperation({ summary: 'Create a brand-new company-owned account directly (no email invite, no Google sign-in) — see OrganizationService.createLocalMember' })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiResponse({ status: 201, type: CreateLocalMemberResultDto })
  createLocalMember(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Req() req: RequestWithUser,
    @Body() dto: CreateLocalMemberDto,
  ): Promise<CreateLocalMemberResultDto> {
    return this.organizationService.createLocalMember(organizationId, req.user.id, dto);
  }

  @Post(':organizationId/members/:targetUserId/reset-password')
  @HttpCode(200)
  @UseGuards(OrganizationGuard)
  @ApiOperation({ summary: "Reset a company-managed member's password to the shared default and force a change on next login" })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiParam({ name: 'targetUserId', type: Number })
  @ApiResponse({ status: 200, type: ResetLocalPasswordResultDto })
  resetLocalPassword(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Param('targetUserId', ParseIntPipe) targetUserId: number,
    @Req() req: RequestWithUser,
  ): Promise<ResetLocalPasswordResultDto> {
    return this.organizationService.resetLocalPassword(organizationId, req.user.id, targetUserId);
  }

  @Post(':organizationId/members/accept')
  @Scope('business', { allowNoOrg: true })
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
  @ApiOperation({ summary: "Change the role of a member the caller is allowed to manage, to a role the caller is allowed to assign (see OrganizationService.changeRole)" })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiParam({ name: 'targetUserId', type: Number })
  @ApiResponse({ status: 200, type: OrganizationMembershipDto })
  changeRole(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Param('targetUserId', ParseIntPipe) targetUserId: number,
    @Req() req: RequestWithUser,
    @Body() dto: ChangeMemberRoleDto,
  ): Promise<OrganizationMembershipDto> {
    return this.organizationService.changeRole(organizationId, req.user.id, targetUserId, dto);
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
  @ApiOperation({ summary: 'Remove a member the caller is allowed to manage from the organization (see OrganizationService.removeMember)' })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiParam({ name: 'targetUserId', type: Number })
  @ApiResponse({ status: 204, description: 'Membership removed' })
  removeMember(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Param('targetUserId', ParseIntPipe) targetUserId: number,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    return this.organizationService.removeMember(organizationId, req.user.id, targetUserId);
  }

  @Get(':organizationId/cars')
  @UseGuards(OrganizationGuard)
  @ApiOperation({ summary: "List every car currently in the organization's fleet" })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiResponse({ status: 200, type: [OrganizationCarDto] })
  getCars(@Param('organizationId', ParseIntPipe) organizationId: number): Promise<OrganizationCarDto[]> {
    return this.organizationService.getOrganizationCars(organizationId);
  }

  @Post(':organizationId/cars/import')
  @UseGuards(OrganizationGuard)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Bulk-create cars directly in the fleet from an uploaded .csv/.xlsx/.xls file — Director-tier only ' +
      '(enforced per-row in CarService.createCar, same as adding a single company car). A bad row fails on its own; ' +
      "the rest of the file still imports. Columns: make, model (required), variant, year, license_plate, vin, " +
      'nickname, fuel_type, transmission, color, current_mileage.',
  })
  @ApiResponse({ status: 200, type: ImportCarsResultDto })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  async importCars(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Req() req: RequestWithUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportCarsResultDto> {
    if (!file) throw new BadRequestException('No file uploaded. Please attach a file with the field name "file".');
    const rows = await parseFleetImportFile(file);
    const results = await this.carService.importCars(rows, organizationId, req.user.google_id);
    return {
      total: results.length,
      created: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  @Delete(':organizationId/cars/:carId')
  @HttpCode(204)
  @UseGuards(OrganizationGuard)
  @ApiOperation({ summary: "Remove a car from the organization (un-links it, doesn't delete it — it becomes personal again)" })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiParam({ name: 'carId', type: Number })
  @ApiResponse({ status: 204, description: 'Car un-linked from the organization' })
  removeCar(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Param('carId', ParseIntPipe) carId: number,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    return this.organizationService.removeCarFromOrganization(organizationId, carId, req.user.id);
  }

  @Delete(':organizationId')
  @HttpCode(204)
  @UseGuards(OrganizationGuard)
  @RequiredOrgRole(OrganizationRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Delete an organization permanently — its cars and suppliers aren't deleted, they become personal again" })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiResponse({ status: 204, description: 'Organization deleted' })
  deleteOrganization(@Param('organizationId', ParseIntPipe) organizationId: number): Promise<void> {
    return this.organizationService.deleteOrganization(organizationId);
  }
}
