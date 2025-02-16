import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CarService } from './car.service';
import { AddCarDto } from './dto/add-car.dto';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CarDto } from './dto/car.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { RequestWithUser } from '../auth/express-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uui } from 'uuid';
import { extname } from 'path';

@Controller('car')
@ApiTags('car')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth()
export class CarController {
  constructor(private readonly carService: CarService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new car' })
  @ApiResponse({
    status: 201,
    description: 'The car has been successfully created.',
    type: CarDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: '/var/www/hau_app/history-auto-utility-be/uploads/cars',
        filename: (req, file, cb) => {
          const uniqueSuffix = `${uui()}${extname(file.originalname)}`;
          cb(null, uniqueSuffix);
        },
      }),
      fileFilter: (req, file, cb) => {
        // todo review uploaded files formats
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
          return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 1 * 1024 * 1024 }, // Limită de fișier: 1 MB
    }),
  )
  async createCar(
    @Body() createCarDto: AddCarDto,
    @Req() req: RequestWithUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<CarDto> {
    if (!req?.user?.google_id) {
      throw new Error('User is not authenticated or google_id is missing');
    }

    let image: string | null = null;
    if (file) {
      image = `/uploads/cars/${file.filename}`;
    }
    return await this.carService.createCar(
      {
        ...createCarDto,
        image,
      },
      req.user.google_id,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get car by ID' })
  @ApiResponse({
    status: 200,
    description: 'Return car details.',
    type: CarDto,
  })
  @ApiResponse({ status: 404, description: 'Car not found.' })
  async getCar(@Param('id') id: string): Promise<CarDto | null> {
    return this.carService.getCar(Number(id));
  }

  @Put()
  @ApiOperation({ summary: 'Update a car' })
  @ApiResponse({
    status: 200,
    description: 'The car has been successfully updated.',
    type: CarDto,
  })
  @ApiResponse({ status: 404, description: 'Car not found.' })
  async updateCar(@Body() updateCarDto: UpdateCarDto): Promise<CarDto> {
    return this.carService.updateCar(Number(updateCarDto?.id), updateCarDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a car' })
  @ApiResponse({
    status: 200,
    description: 'The car has been successfully deleted.',
    type: CarDto,
  })
  @ApiResponse({ status: 404, description: 'Car not found.' })
  async deleteCar(@Param('id') id: string): Promise<CarDto> {
    return this.carService.deleteCar(Number(id));
  }

  @Get()
  @ApiOperation({ summary: 'Get all cars' })
  @ApiResponse({
    status: 200,
    description: 'Return list of cars.',
    type: [CarDto],
  })
  async getAllCars(): Promise<CarDto[]> {
    return this.carService.getAllCars();
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get all cars for a specific user' })
  @ApiResponse({
    status: 200,
    description: 'Return list of cars.',
    type: [CarDto],
  })
  async getCarsByUser(@Param('user-id') userId: string): Promise<CarDto[]> {
    return this.carService.getCarsByUser(Number(userId));
  }
}
