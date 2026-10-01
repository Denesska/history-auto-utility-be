import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { CarNoteService } from './car-note.service';
import { CreateCarNoteDto } from './dto/create-car-note.dto';
import { UpdateCarNoteDto } from './dto/update-car-note.dto';
import { CarNoteDto } from './dto/car-note.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../auth/express-request.interface';

@ApiTags('car-note')
@UseGuards(JwtAuthGuard)
@Controller('car-note')
export class CarNoteController {
  constructor(private readonly carNoteService: CarNoteService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new car note' })
  @ApiResponse({ status: 201, type: CarNoteDto })
  async createCarNote(@Req() req: RequestWithUser, @Body() createCarNoteDto: CreateCarNoteDto): Promise<CarNoteDto> {
    return this.carNoteService.createCarNote(createCarNoteDto, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get car note by ID' })
  @ApiResponse({ status: 200, type: CarNoteDto })
  @ApiResponse({ status: 404, description: 'Car note not found.' })
  async getCarNote(@Req() req: RequestWithUser, @Param('id') id: string): Promise<CarNoteDto | null> {
    return this.carNoteService.getCarNote(Number(id), req.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a car note' })
  @ApiResponse({ status: 200, type: CarNoteDto })
  @ApiResponse({ status: 404, description: 'Car note not found.' })
  async updateCarNote(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() updateCarNoteDto: UpdateCarNoteDto,
  ): Promise<CarNoteDto> {
    return this.carNoteService.updateCarNote(Number(id), updateCarNoteDto, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a car note' })
  @ApiResponse({ status: 200, type: CarNoteDto })
  async deleteCarNote(@Req() req: RequestWithUser, @Param('id') id: string): Promise<CarNoteDto> {
    return this.carNoteService.deleteCarNote(Number(id), req.user.id);
  }

  @Get('car/:carId')
  @ApiOperation({ summary: 'Get all notes for a specific car' })
  @ApiResponse({ status: 200, type: [CarNoteDto] })
  async getCarNotesByCarId(@Req() req: RequestWithUser, @Param('carId') carId: string): Promise<CarNoteDto[]> {
    return this.carNoteService.getCarNotesByCarId(Number(carId), req.user.id);
  }
}
