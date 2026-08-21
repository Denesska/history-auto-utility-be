import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { NotificationDto, UnreadCountDto } from './dto/notification.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

@Controller('notifications')
@ApiTags('notifications')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushService: PushService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the current user' })
  @ApiResponse({ status: 200, type: [NotificationDto] })
  list(
    @Req() req: RequestWithUser,
    @Query('unreadOnly') unreadOnly?: string,
  ): Promise<NotificationDto[]> {
    return this.notificationsService.findForUser(req.user.id, unreadOnly === 'true');
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get the number of unread notifications' })
  @ApiResponse({ status: 200, type: UnreadCountDto })
  async unreadCount(@Req() req: RequestWithUser): Promise<UnreadCountDto> {
    const count = await this.notificationsService.countUnread(req.user.id);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  @ApiResponse({ status: 200, type: NotificationDto })
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ): Promise<NotificationDto> {
    return this.notificationsService.markAsRead(req.user.id, id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200 })
  markAllAsRead(@Req() req: RequestWithUser): Promise<void> {
    return this.notificationsService.markAllAsRead(req.user.id);
  }

  @Delete('read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete all notifications already marked as read' })
  @ApiResponse({ status: 204 })
  clearRead(@Req() req: RequestWithUser): Promise<void> {
    return this.notificationsService.clearRead(req.user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a single notification' })
  @ApiResponse({ status: 204 })
  delete(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    return this.notificationsService.delete(req.user.id, id);
  }

  @Post('push-token')
  @HttpCode(204)
  @ApiOperation({ summary: 'Register a device push token for the current user' })
  @ApiResponse({ status: 204 })
  registerPushToken(
    @Body() dto: RegisterPushTokenDto,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    return this.pushService.registerToken(req.user.id, dto.token, dto.platform);
  }
}
