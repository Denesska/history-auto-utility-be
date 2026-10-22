import { Scope } from '../../common/context/scope.decorator';
import { Feature } from '../../common/features/feature.decorator';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  ServiceUnavailableException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RequestWithUser } from '../auth/express-request.interface';
import { MaintenanceRecordService } from './maintenance-record.service';
import { MaintenanceRecord as MaintenanceRecordModel } from '@prisma/client';
import { CreateMaintenanceRecordDto } from './dto/create-maintenance-record.dto';
import { UpdateMaintenanceRecordDto } from './dto/update-maintenance-record.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { InvoiceExtractionService } from './invoice-extraction/invoice-extraction.service';
import { InvoiceExtractionResultDto } from './invoice-extraction/invoice-extraction.dto';

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
    private readonly invoiceExtractionService: InvoiceExtractionService,
  ) {}

  @Post('extract-invoice')
  @ApiOperation({
    summary: 'Extract one reconciled maintenance entry from 1-3 invoice / service report photos or PDFs (suggestion only, does not save)',
    description:
      'All files must belong to ONE intervention (e.g. a parts invoice plus the workshop work order). Parts repeated across ' +
      'documents are counted once; totals are computed server-side. The user must review before saving.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' }, maxItems: 3 },
        car_id: { type: 'integer', description: 'Optional: gives the model vehicle context.' },
        lang: { type: 'string', enum: ['ro', 'en', 'ru'], default: 'ro' },
      },
    },
  })
  @ApiResponse({ status: 201, type: InvoiceExtractionResultDto })
  @ApiResponse({ status: 400, description: 'No files, too many files, or invalid car_id/lang.' })
  @ApiResponse({ status: 415, description: 'Unsupported file type.' })
  @ApiResponse({ status: 429, description: 'AI quota exceeded.' })
  @ApiResponse({ status: 503, description: 'AI extraction service is temporarily unavailable.' })
  @UseInterceptors(FilesInterceptor('files', 3, { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  async extractInvoice(
    @Req() req: RequestWithUser,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { car_id?: string; lang?: string },
  ): Promise<InvoiceExtractionResultDto> {
    const rawCar = body?.car_id;
    const carId = rawCar !== undefined && rawCar !== '' ? Number(rawCar) : null;
    if (carId !== null && !Number.isInteger(carId)) throw new BadRequestException('car_id must be an integer.');
    return this.invoiceExtractionService.extract(files, req.user.id, { carId, lang: body?.lang });
  }

  @Post('suggest-category')
  @ApiOperation({
    summary:
      "AI fallback: suggest a service_category from a record's description/parts text. Suggestion only, does not save.",
  })
  @ApiResponse({ status: 200, type: SuggestedCategoryDto })
  @ApiResponse({ status: 503, description: 'The category suggestion service is temporarily unavailable.' })
  async suggestCategory(
    @Req() req: RequestWithUser,
    @Body() suggestCategoryDto: SuggestCategoryDto,
  ): Promise<SuggestedCategoryDto> {
    try {
      const result = await this.categorySuggestionService.suggest(
        suggestCategoryDto.description,
        suggestCategoryDto.part_names ?? [],
        req.user.id,
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
