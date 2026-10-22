import { Scope } from '../../common/context/scope.decorator';
import { Body, Controller, Delete, Get, HttpCode, Put, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { ReminderSnoozeService } from './reminder-snooze.service';
import { CarMuteDto, MuteCarDto, SnoozeReminderDto, SnoozeResultDto } from './dto/snooze-reminder.dto';

// Same scoping as the notifications endpoints the snooze is launched from (any context; car access is checked per item).
// Car-mute endpoints are car endpoints, but are also reached from there, so the same scope applies (cars of the other
// context are filtered out by CarAccessService, which resolves access per session context).
@Scope('personal', 'business', { allowNoOrg: true })
@Controller('reminders')
@ApiTags('reminders')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth()
export class ReminderSnoozeController {
  constructor(private readonly snoozeService: ReminderSnoozeService) {}

  @Post('snooze')
  @HttpCode(200)
  @ApiOperation({ summary: 'Snooze the reminders of the item behind a notification (3 or 7 days, or null = do not remind again)' })
  @ApiResponse({ status: 200, type: SnoozeResultDto })
  snooze(@Body() dto: SnoozeReminderDto, @Req() req: RequestWithUser): Promise<SnoozeResultDto> {
    return this.snoozeService.snoozeFromNotification(req.user.id, dto.notificationId, dto.days);
  }

  @Delete('snooze/:notificationId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove the snooze of the item behind a notification' })
  unsnooze(@Param('notificationId', ParseIntPipe) notificationId: number, @Req() req: RequestWithUser): Promise<void> {
    return this.snoozeService.unsnoozeFromNotification(req.user.id, notificationId);
  }

  @Put('car-mute/:carId')
  @ApiOperation({ summary: 'Mute all reminders of a car for the current user (months 1|3|6, or null = until turned back on)' })
  @ApiResponse({ status: 200, type: CarMuteDto })
  muteCar(@Param('carId', ParseIntPipe) carId: number, @Body() dto: MuteCarDto, @Req() req: RequestWithUser): Promise<CarMuteDto> {
    return this.snoozeService.muteCar(req.user.id, carId, dto.months);
  }

  @Delete('car-mute/:carId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Turn the reminders of a car back on for the current user' })
  unmuteCar(@Param('carId', ParseIntPipe) carId: number, @Req() req: RequestWithUser): Promise<void> {
    return this.snoozeService.unmuteCar(req.user.id, carId);
  }

  @Get('car-mutes')
  @ApiOperation({ summary: "The current user's active car-level mutes" })
  @ApiResponse({ status: 200, type: [CarMuteDto] })
  carMutes(@Req() req: RequestWithUser): Promise<CarMuteDto[]> {
    return this.snoozeService.listMutes(req.user.id);
  }
}
