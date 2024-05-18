import {Controller, Get, Post, Body, Param, UseGuards, Put, Delete} from '@nestjs/common';
import { CarService } from './car.service';
import { AddCarDto } from './dto/add-car.dto';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {RolesGuard} from "../../common/guards/roles/roles.guard";
import {Roles} from "../../common/decorators/roles.decorator";
import {CarDto} from "./dto/car.dto";
import {UpdateCarDto} from "./dto/update-car.dto";

@ApiTags('car')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('car')
export class CarController {
    constructor(private readonly carService: CarService) {}

    @Post()
    // @Roles('admin')
    @ApiOperation({ summary: 'Create a new car' })
    @ApiResponse({ status: 201, description: 'The car has been successfully created.', type: CarDto })
    @ApiResponse({ status: 403, description: 'Forbidden.' })
    async createCar(@Body() createCarDto: AddCarDto): Promise<CarDto> {
        return this.carService.createCar(createCarDto);
    }

    @Get(':id')
    // @Roles('user', 'admin')
    @ApiOperation({ summary: 'Get car by ID' })
    @ApiResponse({ status: 200, description: 'Return car details.', type: CarDto })
    @ApiResponse({ status: 404, description: 'Car not found.' })
    async getCar(@Param('id') id: string): Promise<CarDto | null> {
        return this.carService.getCar(Number(id));
    }

    @Put(':id')
    @Roles('admin')
    @ApiOperation({ summary: 'Update a car' })
    @ApiResponse({ status: 200, description: 'The car has been successfully updated.', type: CarDto })
    @ApiResponse({ status: 404, description: 'Car not found.' })
    async updateCar(@Param('id') id: string, @Body() updateCarDto: UpdateCarDto): Promise<CarDto> {
        return this.carService.updateCar(Number(id), updateCarDto);
    }

    @Delete(':id')
    @Roles('admin')
    @ApiOperation({ summary: 'Delete a car' })
    @ApiResponse({ status: 200, description: 'The car has been successfully deleted.', type: CarDto })
    @ApiResponse({ status: 404, description: 'Car not found.' })
    async deleteCar(@Param('id') id: string): Promise<CarDto> {
        return this.carService.deleteCar(Number(id));
    }

    @Get()
    @Roles('user', 'admin')
    @ApiOperation({ summary: 'Get all cars' })
    @ApiResponse({ status: 200, description: 'Return list of cars.', type: [CarDto] })
    async getAllCars(): Promise<CarDto[]> {
        return this.carService.getAllCars();
    }

    @Get('user/:user-id')
    @Roles('user', 'admin')
    @ApiOperation({ summary: 'Get all cars for a specific user' })
    @ApiResponse({ status: 200, description: 'Return list of cars.', type: [CarDto] })
    async getCarsByUser(@Param('user-id') userId: string): Promise<CarDto[]> {
        return this.carService.getCarsByUser(Number(userId));
    }

}
