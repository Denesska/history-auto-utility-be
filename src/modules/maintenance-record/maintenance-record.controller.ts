import { Scope } from '../../common/context/scope.decorator';
import { Feature } from '../../common/features/feature.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { RequestWithUser } from '../auth/express-request.interface';
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
import { MaintenanceRecordDto } from './dto/maintenance-record.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuggestCategoryDto, SuggestedCategoryDto } from './dto/suggest-category.dto';
import {
  CategorySuggestionService,
  CategorySuggestionServiceUnavailableError,
} from './category-suggestion.service';

@ApiTags('maintenance-record')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Scope('personal', 'business')
@Feature('maintenance')
@Controller('maintenance-record')
export class MaintenanceRecordController {
  constructor(
    private readonly maintenanceRecordService: MaintenanceRecordService,
    private readonly categorySuggestionService: CategorySuggestionService,
  ) {}

  @Post('suggest-category')
  @ApiOperation({
    summary:
      "AI fallback: suggest a service_category from a record's description/parts text. Suggestion only, does not save.",
  })
  @ApiResponse({ status: 200, type: SuggestedCategoryDto })
  @ApiResponse({ status: 503, description: 'The category suggestion service is temporarily unavailable.' })
  async suggestCategory(
    @Body() suggestCategoryDto: SuggestCategoryDto,
  ): Promise<SuggestedCategoryDto> {
    try {
      const result = await this.categorySuggestionService.suggest(
        suggestCategoryDto.description,
        suggestCategoryDto.part_names ?? [],
      );
      return result ?? { category: null, confidence: 'low' };
    } catch (err) {
      if (err instanceof CategorySuggestionServiceUnavailableError) {
        throw new ServiceUnavailableException(
          'The category suggestion service is temporarily overloaded. Please pick a category manually.',
        );
      }
      throw err;
    }
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all maintenance records for the authenticated user (owned + shared cars)' })
  @ApiResponse({ status: 200, type: [MaintenanceRecordDto] })
  async getAllMaintenanceRecords(@Req() req: RequestWithUser): Promise<MaintenanceRecordModel[]> {
    return this.maintenanceRecordService.getAllByUser(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new maintenance record' })
  @ApiResponse({
    status: 201,
    description: 'The maintenance record has been successfully created.',
    type: MaintenanceRecordDto,
  })
  async createMaintenanceRecord(
    @Req() req: RequestWithUser,
    @Body() createMaintenanceRecordDto: CreateMaintenanceRecordDto,
  ): Promise<MaintenanceRecordModel> {
    return this.maintenanceRecordService.createMaintenanceRecord(
      createMaintenanceRecordDto,
      req.user.id,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get maintenance record by ID' })
  @ApiResponse({
    status: 200,
    description: 'Return maintenance record details.',
    type: MaintenanceRecordDto,
  })
  @ApiResponse({ status: 404, description: 'Maintenance record not found.' })
  async getMaintenanceRecord(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ): Promise<MaintenanceRecordModel | null> {
    return this.maintenanceRecordService.getMaintenanceRecord(Number(id), req.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a maintenance record' })
  @ApiResponse({
    status: 200,
    description: 'The maintenance record has been successfully updated.',
    type: MaintenanceRecordDto,
  })
  @ApiResponse({ status: 404, description: 'Maintenance record not found.' })
  async updateMaintenanceRecord(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() updateMaintenanceRecordDto: UpdateMaintenanceRecordDto,
  ): Promise<MaintenanceRecordModel> {
    return this.maintenanceRecordService.updateMaintenanceRecord(
      Number(id),
      updateMaintenanceRecordDto,
      req.user.id,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a maintenance record' })
  @ApiResponse({
    status: 200,
    description: 'The maintenance record has been successfully deleted.',
    type: MaintenanceRecordDto,
  })
  @ApiResponse({ status: 404, description: 'Maintenance record not found.' })
  async deleteMaintenanceRecord(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ): Promise<MaintenanceRecordModel> {
    return this.maintenanceRecordService.deleteMaintenanceRecord(Number(id), req.user.id);
  }

  @Get('car/:carId')
  @ApiOperation({ summary: 'Get all maintenance records for a specific car' })
  @ApiResponse({
    status: 200,
    description: 'Return list of maintenance records.',
    type: [MaintenanceRecordDto],
  })
  async getMaintenanceRecordsByCarId(
    @Req() req: RequestWithUser,
    @Param('carId') carId: string,
  ): Promise<MaintenanceRecordModel[]> {
    return this.maintenanceRecordService.getMaintenanceRecordsByCarId(
      Number(carId),
      req.user.id,
    );
  }
}
