import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VehicleCatalogService } from './vehicle-catalog.service';
import { MakeResponseDto } from './dto/make-response.dto';
import { ModelResponseDto } from './dto/model-response.dto';
import { YearResponseDto } from './dto/year-response.dto';

@Controller('vehicle-catalog')
@ApiTags('vehicle-catalog')
export class VehicleCatalogController {
  constructor(private readonly vehicleCatalogService: VehicleCatalogService) {}

  @Get('makes')
  @ApiOperation({ summary: 'List all car makes' })
  @ApiResponse({ status: 200, type: [MakeResponseDto] })
  getMakes(): Promise<MakeResponseDto[]> {
    return this.vehicleCatalogService.getMakes();
  }

  @Get('makes/:makeId/models')
  @ApiOperation({ summary: 'List models for a given make' })
  @ApiParam({ name: 'makeId', type: Number })
  @ApiResponse({ status: 200, type: [ModelResponseDto] })
  getModels(@Param('makeId') makeId: string): Promise<ModelResponseDto[]> {
    return this.vehicleCatalogService.getModels(Number(makeId));
  }

  @Get('models/:modelId/years')
  @ApiOperation({ summary: 'List years for a given model' })
  @ApiParam({ name: 'modelId', type: Number })
  @ApiResponse({ status: 200, type: [YearResponseDto] })
  getYears(@Param('modelId') modelId: string): Promise<YearResponseDto[]> {
    return this.vehicleCatalogService.getYears(Number(modelId));
  }
}
