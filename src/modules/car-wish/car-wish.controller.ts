import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CarWishService } from './car-wish.service';
import { CreateCarWishDto } from './dto/create-car-wish.dto';
import { UpdateCarWishDto } from './dto/update-car-wish.dto';
import { CarWishDto } from './dto/car-wish.dto';
import { CarWishlistDto } from './dto/car-wishlist.dto';
import { ReorderCarWishesDto } from './dto/reorder-car-wishes.dto';
import { UpdateWishlistBudgetDto } from './dto/update-wishlist-budget.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('car-wish')
@UseGuards(JwtAuthGuard)
@Controller('car-wish')
export class CarWishController {
    constructor(private readonly carWishService: CarWishService) {}

    @Get('car/:carId')
    @ApiOperation({ summary: 'Get the whole wishlist (budget + ordered items) for a car' })
    @ApiResponse({ status: 200, type: CarWishlistDto })
    async getWishlist(@Param('carId') carId: string): Promise<CarWishlistDto> {
        return this.carWishService.getWishlist(Number(carId));
    }

    @Post()
    @ApiOperation({ summary: 'Add a wish to a car' })
    @ApiResponse({ status: 201, type: CarWishDto })
    async createWish(@Body() createCarWishDto: CreateCarWishDto): Promise<CarWishDto> {
        return this.carWishService.createWish(createCarWishDto);
    }

    @Put('car/:carId/reorder')
    @ApiOperation({ summary: 'Set the priority order of a car\'s wishes' })
    @ApiResponse({ status: 200, type: [CarWishDto] })
    async reorderWishes(@Param('carId') carId: string, @Body() dto: ReorderCarWishesDto): Promise<CarWishDto[]> {
        return this.carWishService.reorderWishes(Number(carId), dto.ids);
    }

    @Put('car/:carId/budget')
    @ApiOperation({ summary: 'Set the spending ceiling the budget line is drawn at' })
    @ApiResponse({ status: 200, type: CarWishlistDto })
    async setBudget(@Param('carId') carId: string, @Body() dto: UpdateWishlistBudgetDto): Promise<CarWishlistDto> {
        return this.carWishService.setBudget(Number(carId), dto.budget ?? null);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a wish' })
    @ApiResponse({ status: 200, type: CarWishDto })
    @ApiResponse({ status: 404, description: 'Wish not found.' })
    async updateWish(@Param('id') id: string, @Body() updateCarWishDto: UpdateCarWishDto): Promise<CarWishDto> {
        return this.carWishService.updateWish(Number(id), updateCarWishDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a wish' })
    @ApiResponse({ status: 200, type: CarWishDto })
    async deleteWish(@Param('id') id: string): Promise<CarWishDto> {
        return this.carWishService.deleteWish(Number(id));
    }
}
