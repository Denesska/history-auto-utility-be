import { Body, Controller, Get, Param, ParseEnumPipe, ParseIntPipe, Put, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CarMaintenanceSettingsService } from './car-maintenance-settings.service';
import { MaintenanceSettingDto } from './dto/maintenance-setting.dto';
import { UpdateMaintenanceSettingDto } from './dto/update-maintenance-setting.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { ServiceCategory } from '@prisma/client';

@ApiTags('car-maintenance-settings')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth()
@Controller('car/:carId/maintenance-settings')
export class CarMaintenanceSettingsController {
  constructor(private readonly service: CarMaintenanceSettingsService) {}

  @Get()
  @ApiOperation({ summary: "Get this user's maintenance tracking settings for a car, merged with the global defaults" })
  @ApiResponse({ status: 200, type: [MaintenanceSettingDto] })
  async getSettings(
    @Param('carId', ParseIntPipe) carId: number,
    @Req() req: RequestWithUser,
  ): Promise<MaintenanceSettingDto[]> {
    return this.service.getSettings(carId, req.user.id);
  }

  @Put(':category')
  @ApiOperation({ summary: "Update this user's tracked flag and/or custom interval for one category on a car" })
  @ApiResponse({ status: 200, type: MaintenanceSettingDto })
  async setSetting(
    @Param('carId', ParseIntPipe) carId: number,
    @Param('category', new ParseEnumPipe(ServiceCategory)) category: ServiceCategory,
    @Body() dto: UpdateMaintenanceSettingDto,
    @Req() req: RequestWithUser,
  ): Promise<MaintenanceSettingDto> {
    return this.service.setSetting(carId, req.user.id, category, dto);
  }
}
