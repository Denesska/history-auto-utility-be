import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { MaintenanceRecordService } from './maintenance-record.service';
import { MaintenanceRecord as MaintenanceRecordModel } from '@prisma/client';
import { CreateMaintenanceRecordDto } from './dto/create-maintenance-record.dto';
import { UpdateMaintenanceRecordDto } from './dto/update-maintenance-record.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { MaintenanceRecordDto } from './dto/maintenance-record.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('maintenance-record')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('maintenance-record')
export class MaintenanceRecordController {
  constructor(
    private readonly maintenanceRecordService: MaintenanceRecordService,
  ) {}

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new maintenance record' })
  @ApiResponse({
    status: 201,
    description: 'The maintenance record has been successfully created.',
    type: MaintenanceRecordDto,
  })
  async createMaintenanceRecord(
    @Body() createMaintenanceRecordDto: CreateMaintenanceRecordDto,
  ): Promise<MaintenanceRecordModel> {
    return this.maintenanceRecordService.createMaintenanceRecord(
      createMaintenanceRecordDto,
    );
  }

  @Get(':id')
  @Roles('user', 'admin')
  @ApiOperation({ summary: 'Get maintenance record by ID' })
  @ApiResponse({
    status: 200,
    description: 'Return maintenance record details.',
    type: MaintenanceRecordDto,
  })
  @ApiResponse({ status: 404, description: 'Maintenance record not found.' })
  async getMaintenanceRecord(
    @Param('id') id: string,
  ): Promise<MaintenanceRecordModel | null> {
    return this.maintenanceRecordService.getMaintenanceRecord(Number(id));
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update a maintenance record' })
  @ApiResponse({
    status: 200,
    description: 'The maintenance record has been successfully updated.',
    type: MaintenanceRecordDto,
  })
  @ApiResponse({ status: 404, description: 'Maintenance record not found.' })
  async updateMaintenanceRecord(
    @Param('id') id: string,
    @Body() updateMaintenanceRecordDto: UpdateMaintenanceRecordDto,
  ): Promise<MaintenanceRecordModel> {
    return this.maintenanceRecordService.updateMaintenanceRecord(
      Number(id),
      updateMaintenanceRecordDto,
    );
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a maintenance record' })
  @ApiResponse({
    status: 200,
    description: 'The maintenance record has been successfully deleted.',
    type: MaintenanceRecordDto,
  })
  @ApiResponse({ status: 404, description: 'Maintenance record not found.' })
  async deleteMaintenanceRecord(
    @Param('id') id: string,
  ): Promise<MaintenanceRecordModel> {
    return this.maintenanceRecordService.deleteMaintenanceRecord(Number(id));
  }

  @Get('car/:carId')
  @Roles('user', 'admin')
  @ApiOperation({ summary: 'Get all maintenance records for a specific car' })
  @ApiResponse({
    status: 200,
    description: 'Return list of maintenance records.',
    type: [MaintenanceRecordDto],
  })
  @ApiResponse({ status: 404, description: 'Maintenance records not found.' })
  async getMaintenanceRecordsByCarId(
    @Param('carId') carId: string,
  ): Promise<MaintenanceRecordModel[]> {
    return this.maintenanceRecordService.getMaintenanceRecordsByCarId(
      Number(carId),
    );
  }
}
