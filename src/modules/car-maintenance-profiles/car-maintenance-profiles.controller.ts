import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CarMaintenanceProfilesService } from './car-maintenance-profiles.service';
import { MaintenanceProfileDto } from './dto/maintenance-profile.dto';
import { CreateMaintenanceProfileDto } from './dto/create-maintenance-profile.dto';
import { UpdateMaintenanceProfileDto } from './dto/update-maintenance-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';

@ApiTags('car-maintenance-profiles')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth()
@Controller('car/:carId/maintenance-profiles')
export class CarMaintenanceProfilesController {
  constructor(private readonly service: CarMaintenanceProfilesService) {}

  @Get()
  @ApiOperation({ summary: "Get this user's named custom maintenance profiles for a car" })
  @ApiResponse({ status: 200, type: [MaintenanceProfileDto] })
  async getProfiles(
    @Param('carId', ParseIntPipe) carId: number,
    @Req() req: RequestWithUser,
  ): Promise<MaintenanceProfileDto[]> {
    return this.service.getProfiles(carId, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new named custom maintenance profile for a car' })
  @ApiResponse({ status: 201, type: MaintenanceProfileDto })
  async createProfile(
    @Param('carId', ParseIntPipe) carId: number,
    @Body() dto: CreateMaintenanceProfileDto,
    @Req() req: RequestWithUser,
  ): Promise<MaintenanceProfileDto> {
    return this.service.createProfile(carId, req.user.id, dto.name);
  }

  @Patch(':profileId')
  @ApiOperation({ summary: 'Rename a custom maintenance profile' })
  @ApiResponse({ status: 200, type: MaintenanceProfileDto })
  async renameProfile(
    @Param('carId', ParseIntPipe) carId: number,
    @Param('profileId', ParseIntPipe) profileId: number,
    @Body() dto: UpdateMaintenanceProfileDto,
    @Req() req: RequestWithUser,
  ): Promise<MaintenanceProfileDto> {
    return this.service.renameProfile(carId, req.user.id, profileId, dto.name);
  }

  @Delete(':profileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom maintenance profile and its overrides' })
  @ApiResponse({ status: 204 })
  async deleteProfile(
    @Param('carId', ParseIntPipe) carId: number,
    @Param('profileId', ParseIntPipe) profileId: number,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    return this.service.deleteProfile(carId, req.user.id, profileId);
  }
}
