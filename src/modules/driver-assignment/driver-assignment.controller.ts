import { Scope } from '../../common/context/scope.decorator';
import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { DriverAssignmentService } from './driver-assignment.service';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { AssignableUserDto, DriverAssignmentDto } from './dto/driver-assignment.dto';

@ApiTags('driver-assignment')
@UseGuards(JwtAuthGuard)
@Scope('business')
@Controller('car/:carId/driver-assignment')
export class DriverAssignmentController {
  constructor(private readonly driverAssignmentService: DriverAssignmentService) {}

  @Get()
  @ApiOperation({ summary: "Get a car's current driver, or null if unassigned" })
  @ApiResponse({ status: 200, type: DriverAssignmentDto })
  async getCurrent(@Req() req: RequestWithUser, @Param('carId') carId: string): Promise<DriverAssignmentDto | null> {
    return this.driverAssignmentService.getCurrent(Number(carId), req.user.id);
  }

  @Get('history')
  @ApiOperation({ summary: "Get a car's full driver assignment history, newest first" })
  @ApiResponse({ status: 200, type: [DriverAssignmentDto] })
  async getHistory(@Req() req: RequestWithUser, @Param('carId') carId: string): Promise<DriverAssignmentDto[]> {
    return this.driverAssignmentService.getHistory(Number(carId), req.user.id);
  }

  @Get('candidates')
  @ApiOperation({ summary: "List every accepted member of the car's organization (any role) that can be assigned to the car" })
  @ApiResponse({ status: 200, type: [AssignableUserDto] })
  async getCandidates(@Req() req: RequestWithUser, @Param('carId') carId: string): Promise<AssignableUserDto[]> {
    return this.driverAssignmentService.getAssignableUsers(Number(carId), req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Assign a driver to a car, closing any current assignment' })
  @ApiResponse({ status: 201, type: DriverAssignmentDto })
  async assign(
    @Req() req: RequestWithUser,
    @Param('carId') carId: string,
    @Body() dto: AssignDriverDto,
  ): Promise<DriverAssignmentDto> {
    return this.driverAssignmentService.assignDriver(Number(carId), dto, req.user.id);
  }

  @Delete()
  @ApiOperation({ summary: "End a car's current driver assignment" })
  @ApiResponse({ status: 200 })
  async unassign(@Req() req: RequestWithUser, @Param('carId') carId: string): Promise<void> {
    return this.driverAssignmentService.unassignDriver(Number(carId), req.user.id);
  }
}
