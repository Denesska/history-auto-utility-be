import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { UserSettingsService } from './user-settings.service';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { UserSettingsDto } from './dto/user-settings.dto';

@ApiTags('user-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user-settings')
export class UserSettingsController {
    constructor(private readonly userSettingsService: UserSettingsService) {}

    @Get()
    @ApiOperation({ summary: 'Get the current user settings' })
    @ApiResponse({ status: 200, type: UserSettingsDto })
    getSettings(@Req() req: RequestWithUser): Promise<UserSettingsDto> {
        return this.userSettingsService.getSettings(req.user.id);
    }

    @Put()
    @ApiOperation({ summary: 'Update the current user settings' })
    @ApiResponse({ status: 200, type: UserSettingsDto })
    updateSettings(
        @Req() req: RequestWithUser,
        @Body() dto: UpdateUserSettingsDto,
    ): Promise<UserSettingsDto> {
        return this.userSettingsService.updateSettings(req.user.id, dto);
    }
}
