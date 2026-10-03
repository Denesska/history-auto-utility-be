import { Scope } from '../../common/context/scope.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';
import { SupplierService } from './supplier.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierDto } from './dto/supplier.dto';

@ApiTags('supplier')
@UseGuards(JwtAuthGuard)
@Scope('business')
@Controller('supplier')
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Get()
  @ApiOperation({ summary: 'Get every supplier the user can see (own + shared via an organization)' })
  @ApiResponse({ status: 200, type: [SupplierDto] })
  async getAll(@Req() req: RequestWithUser): Promise<SupplierDto[]> {
    return this.supplierService.getAllSuppliers(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new supplier' })
  @ApiResponse({ status: 201, type: SupplierDto })
  async create(@Req() req: RequestWithUser, @Body() dto: CreateSupplierDto): Promise<SupplierDto> {
    return this.supplierService.createSupplier(dto, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a supplier by id' })
  @ApiResponse({ status: 200, type: SupplierDto })
  @ApiResponse({ status: 404, description: 'Supplier not found.' })
  async getOne(@Req() req: RequestWithUser, @Param('id') id: string): Promise<SupplierDto> {
    return this.supplierService.getSupplier(Number(id), req.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a supplier' })
  @ApiResponse({ status: 200, type: SupplierDto })
  @ApiResponse({ status: 404, description: 'Supplier not found.' })
  async update(@Req() req: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateSupplierDto): Promise<SupplierDto> {
    return this.supplierService.updateSupplier(Number(id), dto, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a supplier' })
  @ApiResponse({ status: 200, type: SupplierDto })
  @ApiResponse({ status: 404, description: 'Supplier not found.' })
  async remove(@Req() req: RequestWithUser, @Param('id') id: string): Promise<SupplierDto> {
    return this.supplierService.deleteSupplier(Number(id), req.user.id);
  }
}
