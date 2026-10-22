import { Scope } from '../../common/context/scope.decorator';
import { BusinessRoles } from '../../common/context/business-roles.decorator';
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
  ForbiddenException,
} from '@nestjs/common';
import { CAR_CREATE_ROLES, CarService } from './car.service';
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
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';

const carPhotoStorage = diskStorage({
  destination: './uploads/cars',
  filename: (req, file, cb) => {
    cb(null, `${randomUUID()}${extname(file.originalname)}`);
  },
});

const carPhotoFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
    return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};

@Scope('personal', 'business')
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
  // Business: only an org admin manages the fleet (see "Adding a car" in
  // ACCOUNT-CONTEXT.md) — every other role (DRIVER, FINANCE, ...) is rejected with
  // 403 ROLE_NOT_ALLOWED before the handler runs. Personal sessions are unaffected
  // (BusinessRoles is a no-op outside business context). Same role set CarService
  // itself re-checks for both this and the bulk import (see CAR_CREATE_ROLES).
  @BusinessRoles(...CAR_CREATE_ROLES)
  @UseInterceptors(
    FilesInterceptor('files', 13, {
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
  async getCar(@Req() req: RequestWithUser, @Param('id') id: string): Promise<CarDto | null> {
    return this.carService.getCar(Number(id), req.user.id);
  }

  @Put()
  @ApiOperation({ summary: 'Update a car' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Car updated successfully.', type: CarDto })
  @ApiResponse({ status: 404, description: 'Car not found.' })
  @UseInterceptors(
    FilesInterceptor('files', 13, {
      storage: carPhotoStorage,
      fileFilter: carPhotoFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async updateCar(
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: RequestWithUser,
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

    return this.carService.updateCar(id, updateData, photoPaths, deletePhotoIds, defaultPhotoId, defaultNewPhotoIndex, req.user.google_id);
  }

  @Delete('photo/:photoId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a car photo' })
  @ApiResponse({ status: 204, description: 'Photo deleted.' })
  @ApiResponse({ status: 403, description: 'No edit access to the photo\'s car.' })
  @ApiResponse({ status: 404, description: 'Photo not found.' })
  async deletePhoto(@Req() req: RequestWithUser, @Param('photoId') photoId: string): Promise<void> {
    return this.carService.deletePhoto(Number(photoId), req.user.id);
  }

  @Patch('photo/:photoId/default')
  @HttpCode(204)
  @ApiOperation({ summary: 'Set a photo as the default for its car' })
  @ApiResponse({ status: 204, description: 'Default photo updated.' })
  @ApiResponse({ status: 403, description: 'No edit access to the photo\'s car.' })
  @ApiResponse({ status: 404, description: 'Photo not found.' })
  async setDefaultPhoto(@Req() req: RequestWithUser, @Param('photoId') photoId: string): Promise<void> {
    return this.carService.setDefaultPhoto(Number(photoId), req.user.id);
  }

  @Patch(':id/sold')
  @ApiOperation({ summary: 'Mark a car as sold (archive)' })
  @ApiResponse({ status: 200, description: 'Car marked as sold.', type: CarDto })
  @ApiResponse({ status: 403, description: 'Only the owner can archive this car.' })
  async markAsSold(@Param('id') id: string, @Req() req: RequestWithUser): Promise<CarDto> {
    return this.carService.markAsSold(Number(id), req.user.google_id);
  }

  @Patch(':id/restore')
  @ApiOperation({ summary: 'Restore a sold car back to active' })
  @ApiResponse({ status: 200, description: 'Car restored to active.', type: CarDto })
  @ApiResponse({ status: 403, description: 'Only the owner can restore this car.' })
  async restoreCar(@Param('id') id: string, @Req() req: RequestWithUser): Promise<CarDto> {
    return this.carService.restoreCar(Number(id), req.user.google_id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a car' })
  @ApiResponse({ status: 200, description: 'Car deleted successfully.', type: CarDto })
  @ApiResponse({ status: 404, description: 'Car not found.' })
  async deleteCar(@Param('id') id: string, @Req() req: RequestWithUser): Promise<CarDto> {
    return this.carService.deleteCar(Number(id), req.user.google_id);
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
  @Scope('personal')
  @ApiOperation({ summary: 'Get the personal cars of a user (only yourself)' })
  @ApiResponse({ status: 200, description: 'Return list of cars.', type: [CarDto] })
  async getCarsByUser(@Req() req: RequestWithUser, @Param('userId') userId: string): Promise<CarDto[]> {
    if (Number(userId) !== req.user.id) {
      throw new ForbiddenException('You can only list your own cars');
    }
    return this.carService.getCarsByUser(Number(userId));
  }
}
