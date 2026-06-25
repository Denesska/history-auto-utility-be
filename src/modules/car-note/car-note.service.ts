import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCarNoteDto } from './dto/create-car-note.dto';
import { UpdateCarNoteDto } from './dto/update-car-note.dto';
import { CarNoteDto } from './dto/car-note.dto';

@Injectable()
export class CarNoteService {
    constructor(private prisma: PrismaService) {}

    async createCarNote(data: CreateCarNoteDto): Promise<CarNoteDto> {
        return this.prisma.carNote.create({
            data: {
                car_id: data.car_id,
                title: data.title,
                content: data.content,
                group_name: data.group_name ?? null,
            },
        });
    }

    async getCarNote(id: number): Promise<CarNoteDto | null> {
        return this.prisma.carNote.findUnique({ where: { id } });
    }

    async updateCarNote(id: number, data: UpdateCarNoteDto): Promise<CarNoteDto> {
        return this.prisma.carNote.update({
            where: { id },
            data: {
                ...(data.title !== undefined && { title: data.title }),
                ...(data.content !== undefined && { content: data.content }),
                ...(data.group_name !== undefined && { group_name: data.group_name }),
            },
        });
    }

    async deleteCarNote(id: number): Promise<CarNoteDto> {
        return this.prisma.carNote.delete({ where: { id } });
    }

    async getCarNotesByCarId(carId: number): Promise<CarNoteDto[]> {
        return this.prisma.carNote.findMany({
            where: { car_id: carId },
            orderBy: { created_at: 'asc' },
        });
    }
}
