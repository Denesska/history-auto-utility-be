import { Injectable } from '@nestjs/common';
import { Car, Prisma } from '@prisma/client';
import { CarDto } from './dto/car.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AddCarDto } from './dto/add-car.dto';

@Injectable()
export class CarService {
  constructor(private prisma: PrismaService) {}

  async createCar(data: AddCarDto, google_id: string): Promise<CarDto> {
    const user = await this.prisma.user.findUnique({
      where: { google_id },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const car = await this.prisma.car.create({
      data: {
        ...data,
        user_id: user.id,
      },
    });

    return this.toCarDto(car);
  }

  async getCar(id: number): Promise<CarDto | null> {
    const car = await this.prisma.car.findUnique({
      where: { id },
    });
    return car ? this.toCarDto(car) : null;
  }

  async updateCar(id: number, data: Prisma.CarUpdateInput): Promise<CarDto> {
    const car = await this.prisma.car.update({
      where: { id },
      data,
    });
    return this.toCarDto(car);
  }

  async deleteCar(id: number): Promise<CarDto> {
    const car = await this.prisma.car.delete({
      where: { id },
    });
    return this.toCarDto(car);
  }

  async getAllCars(): Promise<CarDto[]> {
    const cars = await this.prisma.car.findMany();
    return cars.map(this.toCarDto);
  }

  async getCarsByUser(userId: number): Promise<CarDto[]> {
    const cars = await this.prisma.car.findMany({
      where: { user_id: userId },
    });
    return cars.map(this.toCarDto);
  }

  private toCarDto(car: Car): CarDto {
    return {
      id: car.id,
      vin: car.vin,
      make: car.make,
      model: car.model,
      year: car.year,
      license_plate: car.license_plate,
      current_mileage: car.current_mileage,
      user_id: car.user_id,
    };
  }
}
