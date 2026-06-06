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
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CarAccessRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CarAccessGuard } from '../../common/guards/car-access/car-access.guard';
import { RequiredCarRole } from '../../common/decorators/required-car-role.decorator';
import { RequestWithUser } from '../auth/express-request.interface';
import { CarAccessService } from './car-access.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { CarAccessDto, SharedCarDto } from './dto/car-access.dto';

@Controller('car')
@ApiTags('car-access')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth()
export class CarAccessController {
  constructor(private readonly carAccessService: CarAccessService) {}

  @Get('shared')
  @ApiOperation({ summary: 'Get all cars shared with the current user' })
  @ApiResponse({ status: 200, type: [SharedCarDto] })
  getSharedCars(@Req() req: RequestWithUser): Promise<SharedCarDto[]> {
    return this.carAccessService.getSharedCars(req.user.google_id);
  }

  @Get(':carId/access')
  @UseGuards(CarAccessGuard)
  @RequiredCarRole(CarAccessRole.VIEWER)
  @ApiOperation({ summary: 'List all users with access to a car' })
  @ApiParam({ name: 'carId', type: Number })
  @ApiResponse({ status: 200, type: [CarAccessDto] })
  getAccessList(@Param('carId', ParseIntPipe) carId: number): Promise<CarAccessDto[]> {
    return this.carAccessService.getAccessList(carId);
  }

  @Post(':carId/access/invite')
  @UseGuards(CarAccessGuard)
  @RequiredCarRole(CarAccessRole.OWNER)
  @ApiOperation({ summary: 'Invite a registered user to access a car' })
  @ApiParam({ name: 'carId', type: Number })
  @ApiResponse({ status: 201, type: CarAccessDto })
  inviteUser(
    @Param('carId', ParseIntPipe) carId: number,
    @Body() dto: InviteUserDto,
    @Req() req: RequestWithUser,
  ): Promise<CarAccessDto> {
    return this.carAccessService.inviteUser(carId, req.user.google_id, dto);
  }

  @Post(':carId/access/accept')
  @ApiOperation({ summary: 'Accept a pending invitation to a car' })
  @ApiParam({ name: 'carId', type: Number })
  @ApiResponse({ status: 200, type: CarAccessDto })
  acceptInvitation(
    @Param('carId', ParseIntPipe) carId: number,
    @Req() req: RequestWithUser,
  ): Promise<CarAccessDto> {
    return this.carAccessService.acceptInvitation(carId, req.user.google_id);
  }

  @Patch(':carId/access/:targetUserId/role')
  @UseGuards(CarAccessGuard)
  @RequiredCarRole(CarAccessRole.OWNER)
  @ApiOperation({ summary: 'Change the role of a user on a car' })
  @ApiParam({ name: 'carId', type: Number })
  @ApiParam({ name: 'targetUserId', type: Number })
  @ApiResponse({ status: 200, type: CarAccessDto })
  changeRole(
    @Param('carId', ParseIntPipe) carId: number,
    @Param('targetUserId', ParseIntPipe) targetUserId: number,
    @Body() dto: ChangeRoleDto,
    @Req() req: RequestWithUser,
  ): Promise<CarAccessDto> {
    return this.carAccessService.changeRole(carId, req.user.google_id, targetUserId, dto);
  }

  @Delete(':carId/access/leave')
  @HttpCode(204)
  @ApiOperation({ summary: 'Leave (remove yourself from) a shared car' })
  @ApiParam({ name: 'carId', type: Number })
  @ApiResponse({ status: 204, description: 'Access removed' })
  leaveAccess(
    @Param('carId', ParseIntPipe) carId: number,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    return this.carAccessService.leaveAccess(carId, req.user.google_id);
  }

  @Delete(':carId/access/:targetUserId')
  @HttpCode(204)
  @UseGuards(CarAccessGuard)
  @RequiredCarRole(CarAccessRole.OWNER)
  @ApiOperation({ summary: 'Remove a user\'s access to a car' })
  @ApiParam({ name: 'carId', type: Number })
  @ApiParam({ name: 'targetUserId', type: Number })
  @ApiResponse({ status: 204, description: 'Access removed' })
  removeAccess(
    @Param('carId', ParseIntPipe) carId: number,
    @Param('targetUserId', ParseIntPipe) targetUserId: number,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    return this.carAccessService.removeAccess(carId, req.user.google_id, targetUserId);
  }
}
