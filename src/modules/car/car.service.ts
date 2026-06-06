import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Car, CarAccessRole, CarPhoto, CarStatus, Prisma } from '@prisma/client';
import { ROLE_RANK } from '../../common/guards/car-access/car-access.guard';
import { CarAccessService } from '../car-access/car-access.service';
import { CarDto, CarPhotoDto } from './dto/car.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AddCarDto } from './dto/add-car.dto';

type CarWithPhotos = Car & { photos: CarPhoto[] };

@Injectable()
export class CarService {
  private readonly logger = new Logger(CarService.name);

  constructor(
    private prisma: PrismaService,
    private carAccessService: CarAccessService,
  ) {}

  async createCar(
    data: AddCarDto,
    google_id: string,
    photoPaths: string[] = [],
    defaultNewPhotoIndex: number = 0,
  ): Promise<CarDto> {
    this.logger.log(`Looking up user with google_id: ${google_id}`);
    const user = await this.prisma.user.findUnique({
      where: { google_id },
    });

    if (!user) {
      this.logger.error(`User not found for google_id: ${google_id}`);
      throw new Error('User not found');
    }

    this.logger.log(`Found user id=${user.id}, creating car...`);
    const { id, default_new_photo_index, ...carData } = data as any;

    let car: CarWithPhotos;
    try {
      car = await this.prisma.car.create({
        data: {
          ...carData,
          ownership_start_date: carData.ownership_start_date ? new Date(carData.ownership_start_date) : null,
          rca_expiry_date: carData.rca_expiry_date ? new Date(carData.rca_expiry_date) : null,
          itp_expiry_date: carData.itp_expiry_date ? new Date(carData.itp_expiry_date) : null,
          rov_expiry_date: carData.rov_expiry_date ? new Date(carData.rov_expiry_date) : null,
          last_oil_service_date: carData.last_oil_service_date ? new Date(carData.last_oil_service_date) : null,
          user_id: user.id,
          photos: photoPaths.length > 0
            ? {
                create: photoPaths.map((url, i) => ({
                  url,
                  is_default: i === defaultNewPhotoIndex,
                })),
              }
            : undefined,
        },
        include: { photos: true },
      }) as CarWithPhotos;
    } catch (e: any) {
      if (e?.code === 'P2002' && e?.meta?.target?.includes('nickname')) {
        throw new ConflictException('A car with this nickname already exists');
      }
      throw e;
    }

    return this.toCarDto(car);
  }

  async getCar(id: number): Promise<CarDto | null> {
    const car = await this.prisma.car.findUnique({
      where: { id },
      include: { photos: true },
    });
    return car ? this.toCarDto(car as CarWithPhotos) : null;
  }

  async updateCar(
    id: number,
    data: Prisma.CarUpdateInput,
    newPhotoPaths: string[] = [],
    deletePhotoIds: number[] = [],
    defaultPhotoId: number | null = null,
    defaultNewPhotoIndex: number | null = null,
    googleId?: string,
  ): Promise<CarDto> {
    if (googleId) {
      const role = await this.carAccessService.resolveUserRole(id, googleId);
      if (ROLE_RANK[role] < ROLE_RANK[CarAccessRole.USER]) {
        throw new ForbiddenException('Insufficient permissions to edit this car');
      }
    }
    const updateData: Prisma.CarUpdateInput = { ...data };

    const dateFields = ['ownership_start_date', 'rca_expiry_date', 'itp_expiry_date', 'rov_expiry_date', 'last_oil_service_date'] as const;
    for (const field of dateFields) {
      if (updateData[field] && typeof updateData[field] === 'string') {
        updateData[field] = new Date(updateData[field] as string);
      }
    }

    // Delete requested photos
    if (deletePhotoIds.length > 0) {
      await this.prisma.carPhoto.deleteMany({
        where: { id: { in: deletePhotoIds }, car_id: id },
      });
    }

    // Clear existing defaults before setting a new one
    const willSetDefault = defaultPhotoId !== null || defaultNewPhotoIndex !== null;
    if (willSetDefault) {
      await this.prisma.carPhoto.updateMany({
        where: { car_id: id },
        data: { is_default: false },
      });
    }

    // Set default on an existing photo
    if (defaultPhotoId !== null) {
      await this.prisma.carPhoto.update({
        where: { id: defaultPhotoId },
        data: { is_default: true },
      });
    }

    // Add new photos, marking the default one if specified
    if (newPhotoPaths.length > 0) {
      updateData.photos = {
        create: newPhotoPaths.map((url, i) => ({
          url,
          is_default: defaultNewPhotoIndex !== null ? i === defaultNewPhotoIndex : false,
        })),
      };
    }

    let car: CarWithPhotos;
    try {
      car = await this.prisma.car.update({
        where: { id },
        data: updateData,
        include: { photos: true },
      }) as CarWithPhotos;
    } catch (e: any) {
      if (e?.code === 'P2002' && e?.meta?.target?.includes('nickname')) {
        throw new ConflictException('A car with this nickname already exists');
      }
      throw e;
    }
    return this.toCarDto(car);
  }

  async deletePhoto(photoId: number): Promise<void> {
    const photo = await this.prisma.carPhoto.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('Photo not found');
    await this.prisma.carPhoto.delete({ where: { id: photoId } });
  }

  async setDefaultPhoto(photoId: number): Promise<void> {
    const photo = await this.prisma.carPhoto.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('Photo not found');
    await this.prisma.carPhoto.updateMany({
      where: { car_id: photo.car_id },
      data: { is_default: false },
    });
    await this.prisma.carPhoto.update({
      where: { id: photoId },
      data: { is_default: true },
    });
  }

  async markAsSold(id: number, googleId?: string): Promise<CarDto> {
    if (googleId) {
      const role = await this.carAccessService.resolveUserRole(id, googleId);
      if (role !== CarAccessRole.OWNER) {
        throw new ForbiddenException('Only the owner can archive this car');
      }
    }
    const car = await this.prisma.car.update({
      where: { id },
      data: { status: CarStatus.SOLD, sold_at: new Date() },
      include: { photos: true },
    });
    return this.toCarDto(car as CarWithPhotos);
  }

  async restoreCar(id: number, googleId?: string): Promise<CarDto> {
    if (googleId) {
      const role = await this.carAccessService.resolveUserRole(id, googleId);
      if (role !== CarAccessRole.OWNER) {
        throw new ForbiddenException('Only the owner can restore this car');
      }
    }
    const car = await this.prisma.car.update({
      where: { id },
      data: { status: CarStatus.ACTIVE, sold_at: null },
      include: { photos: true },
    });
    return this.toCarDto(car as CarWithPhotos);
  }

  async deleteCar(id: number, googleId?: string): Promise<CarDto> {
    if (googleId) {
      const role = await this.carAccessService.resolveUserRole(id, googleId);
      if (role !== CarAccessRole.OWNER) {
        throw new ForbiddenException('Only the owner can delete this car');
      }
    }
    const car = await this.prisma.car.delete({
      where: { id },
      include: { photos: true },
    });
    return this.toCarDto(car as CarWithPhotos);
  }

  async getAllCars(google_id: string): Promise<CarDto[]> {
    const user = await this.prisma.user.findUnique({
      where: { google_id },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const cars = await this.prisma.car.findMany({
      where: { user_id: user.id },
      include: { photos: true },
    });
    return cars.map(car => this.toCarDto(car as CarWithPhotos));
  }

  async getCarsByUser(userId: number): Promise<CarDto[]> {
    const cars = await this.prisma.car.findMany({
      where: { user_id: userId },
      include: { photos: true },
    });
    return cars.map(car => this.toCarDto(car as CarWithPhotos));
  }

  private toCarDto(car: CarWithPhotos): CarDto {
    return {
      id: car.id,
      user_id: car.user_id,
      vin: car.vin,
      nickname: car.nickname,
      make: car.make,
      model: car.model,
      variant: car.variant,
      year: car.year,
      license_plate: car.license_plate,
      fuel_type: car.fuel_type,
      transmission: car.transmission,
      engine: car.engine,
      color: car.color,
      current_mileage: car.current_mileage,
      ownership_start_date: car.ownership_start_date,
      rca_expiry_date: car.rca_expiry_date,
      itp_expiry_date: car.itp_expiry_date,
      rov_expiry_date: car.rov_expiry_date,
      last_oil_service_date: car.last_oil_service_date,
      last_oil_service_mileage: car.last_oil_service_mileage,
      status: car.status,
      sold_at: (car as any).sold_at ?? null,
      photos: car.photos.map((p: CarPhoto): CarPhotoDto => ({
        id: p.id,
        url: p.url,
        is_default: p.is_default,
      })),
    };
  }
}
