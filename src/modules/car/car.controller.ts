import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { CarService } from './car.service';
import { AddCarDto } from './dto/add-car.dto';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiConsumes,
} from '@nestjs/swagger';
import { CarDto } from './dto/car.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { RequestWithUser } from '../auth/express-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uui } from 'uuid';
import { extname } from 'path';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';

const carPhotoStorage = diskStorage({
  destination: './uploads/cars',
  filename: (req, file, cb) => {
    cb(null, `${uui()}${extname(file.originalname)}`);
  },
});

const carPhotoFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
    return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};

@Controller('car')
@ApiTags('car')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth()
export class CarController {
  private readonly logger = new Logger(CarController.name);

  constructor(private readonly carService: CarService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new car' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Car created successfully.', type: CarDto })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: carPhotoStorage,
      fileFilter: carPhotoFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async createCar(
    @Body() createCarDto: AddCarDto,
    @Req() req: RequestWithUser,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<CarDto> {
    if (!req?.user?.google_id) {
      throw new Error('User is not authenticated or google_id is missing');
    }

    this.logger.log(`Creating car for user ${req.user.google_id} | files: ${files?.length ?? 0} | dto: ${JSON.stringify(createCarDto)}`);

    const photoPaths = (files ?? []).map(f => `/uploads/cars/${f.filename}`);
    const defaultNewPhotoIndex = Number(createCarDto.default_new_photo_index ?? 0);
    const result = await this.carService.createCar(createCarDto, req.user.google_id, photoPaths, defaultNewPhotoIndex);

    this.logger.log(`Car created successfully: id=${result.id}`);
    return result;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get car by ID' })
  @ApiResponse({ status: 200, description: 'Return car details.', type: CarDto })
  @ApiResponse({ status: 404, description: 'Car not found.' })
  async getCar(@Param('id') id: string): Promise<CarDto | null> {
    return this.carService.getCar(Number(id));
  }

  @Put()
  @ApiOperation({ summary: 'Update a car' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Car updated successfully.', type: CarDto })
  @ApiResponse({ status: 404, description: 'Car not found.' })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: carPhotoStorage,
      fileFilter: carPhotoFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async updateCar(
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<CarDto> {
    const updateCarDto = plainToInstance(UpdateCarDto, body);
    await validateOrReject(updateCarDto);

    const updateData = JSON.parse(JSON.stringify(updateCarDto));
    const id = Number(updateData.id);
    if (isNaN(id)) {
      throw new BadRequestException('Invalid car id');
    }
    delete updateData.id;
    delete updateData.default_photo_id;
    delete updateData.default_new_photo_index;
    delete updateData.delete_photo_ids;

    const photoPaths = (files ?? []).map(f => `/uploads/cars/${f.filename}`);

    const deletePhotoIds: number[] = body.delete_photo_ids
      ? JSON.parse(body.delete_photo_ids).map(Number)
      : [];

    const defaultPhotoId = body.default_photo_id != null && body.default_photo_id !== ''
      ? Number(body.default_photo_id)
      : null;

    const defaultNewPhotoIndex = body.default_new_photo_index != null && body.default_new_photo_index !== ''
      ? Number(body.default_new_photo_index)
      : null;

    return this.carService.updateCar(id, updateData, photoPaths, deletePhotoIds, defaultPhotoId, defaultNewPhotoIndex);
  }

  @Delete('photo/:photoId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a car photo' })
  @ApiResponse({ status: 204, description: 'Photo deleted.' })
  @ApiResponse({ status: 404, description: 'Photo not found.' })
  async deletePhoto(@Param('photoId') photoId: string): Promise<void> {
    return this.carService.deletePhoto(Number(photoId));
  }

  @Patch('photo/:photoId/default')
  @HttpCode(204)
  @ApiOperation({ summary: 'Set a photo as the default for its car' })
  @ApiResponse({ status: 204, description: 'Default photo updated.' })
  @ApiResponse({ status: 404, description: 'Photo not found.' })
  async setDefaultPhoto(@Param('photoId') photoId: string): Promise<void> {
    return this.carService.setDefaultPhoto(Number(photoId));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a car' })
  @ApiResponse({ status: 200, description: 'Car deleted successfully.', type: CarDto })
  @ApiResponse({ status: 404, description: 'Car not found.' })
  async deleteCar(@Param('id') id: string): Promise<CarDto> {
    return this.carService.deleteCar(Number(id));
  }

  @Get()
  @ApiOperation({ summary: 'Get all cars for authenticated user' })
  @ApiResponse({ status: 200, description: 'Return list of cars.', type: [CarDto] })
  async getAllCars(@Req() req: RequestWithUser): Promise<CarDto[]> {
    if (!req?.user?.google_id) {
      throw new Error('User is not authenticated or google_id is missing');
    }
    return this.carService.getAllCars(req.user.google_id);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get all cars for a specific user' })
  @ApiResponse({ status: 200, description: 'Return list of cars.', type: [CarDto] })
  async getCarsByUser(@Param('userId') userId: string): Promise<CarDto[]> {
    return this.carService.getCarsByUser(Number(userId));
  }
}
