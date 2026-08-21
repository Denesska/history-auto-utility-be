import { Body, Controller, Get, Param, ParseIntPipe, Put, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CarDeadlineOrderService } from './car-deadline-order.service';
import { DeadlineOrderDto } from './dto/deadline-order.dto';
import { UpdateDeadlineOrderDto } from './dto/update-deadline-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';

@ApiTags('car-deadline-order')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth()
@Controller('car/:carId/deadline-order')
export class CarDeadlineOrderController {
  constructor(private readonly service: CarDeadlineOrderService) {}

  @Get()
  @ApiOperation({ summary: "Get this user's manual order for a car's deadlines" })
  @ApiResponse({ status: 200, type: DeadlineOrderDto })
  async getOrder(
    @Param('carId', ParseIntPipe) carId: number,
    @Req() req: RequestWithUser,
  ): Promise<DeadlineOrderDto> {
    return this.service.getOrder(carId, req.user.id);
  }

  @Put()
  @ApiOperation({ summary: "Replace this user's manual order for a car's deadlines" })
  @ApiResponse({ status: 200, type: DeadlineOrderDto })
  async setOrder(
    @Param('carId', ParseIntPipe) carId: number,
    @Body() dto: UpdateDeadlineOrderDto,
    @Req() req: RequestWithUser,
  ): Promise<DeadlineOrderDto> {
    return this.service.setOrder(carId, req.user.id, dto.order);
  }
}
