import { Injectable } from '@nestjs/common';
import { CarNote, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCarNoteDto } from './dto/create-car-note.dto';
import { UpdateCarNoteDto } from './dto/update-car-note.dto';
import { CarNoteDto } from './dto/car-note.dto';
import { CarNoteChecklistItemDto } from './dto/car-note-checklist-item.dto';

@Injectable()
export class CarNoteService {
    constructor(private prisma: PrismaService) {}

    async createCarNote(data: CreateCarNoteDto): Promise<CarNoteDto> {
        const legacyGroup = data.group_name?.trim() || null;
        // No `labels` but a legacy `group_name` → store it as the single label.
        const labels = data.labels !== undefined
            ? this.normalizeLabels(data.labels)
            : this.normalizeLabels(legacyGroup ? [legacyGroup] : []);
        const note = await this.prisma.carNote.create({
            data: {
                car_id: data.car_id,
                title: data.title,
                content: data.content ?? '',
                // group_name is only written when the client explicitly sends it without labels.
                group_name: data.labels === undefined ? legacyGroup : null,
                labels,
                is_checklist: data.is_checklist ?? false,
                checked_in_place: data.checked_in_place ?? false,
                items: data.items !== undefined ? this.normalizeItems(data.items) : Prisma.DbNull,
                color: data.color ?? null,
            },
        });
        return this.toDto(note);
    }

    async getCarNote(id: number): Promise<CarNoteDto | null> {
        const note = await this.prisma.carNote.findUnique({ where: { id } });
        return note ? this.toDto(note) : null;
    }

    async updateCarNote(id: number, data: UpdateCarNoteDto): Promise<CarNoteDto> {
        const note = await this.prisma.carNote.update({
            where: { id },
            data: {
                ...(data.title !== undefined && { title: data.title }),
                ...(data.content !== undefined && { content: data.content ?? '' }),
                ...(data.group_name !== undefined && data.labels === undefined && { group_name: data.group_name }),
                // Sending labels retires the legacy group so it can't shadow them on read.
                ...(data.labels !== undefined && { labels: this.normalizeLabels(data.labels), group_name: null }),
                ...(data.is_checklist !== undefined && { is_checklist: data.is_checklist }),
                ...(data.checked_in_place !== undefined && { checked_in_place: data.checked_in_place }),
                ...(data.items !== undefined && { items: this.normalizeItems(data.items ?? []) }),
                ...(data.color !== undefined && { color: data.color }),
            },
        });
        return this.toDto(note);
    }

    async deleteCarNote(id: number): Promise<CarNoteDto> {
        return this.toDto(await this.prisma.carNote.delete({ where: { id } }));
    }

    async getCarNotesByCarId(carId: number): Promise<CarNoteDto[]> {
        const notes = await this.prisma.carNote.findMany({
            where: { car_id: carId },
            orderBy: { created_at: 'asc' },
        });
        return notes.map(n => this.toDto(n));
    }

    /** Trim, drop empties, strip commas (the UI's separator), dedupe case-insensitively keeping the first spelling. */
    private normalizeLabels(labels: string[] | null | undefined): string[] {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const raw of labels ?? []) {
            const label = String(raw).replace(/,/g, '').trim();
            if (!label) continue;
            const key = label.toLocaleLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(label);
        }
        return out;
    }

    private normalizeItems(items: CarNoteChecklistItemDto[]): Prisma.InputJsonValue {
        return items.map(i => ({ text: i.text, checked: !!i.checked }));
    }

    private readItems(items: Prisma.JsonValue | null): CarNoteChecklistItemDto[] {
        if (!Array.isArray(items)) return [];
        return items
            .filter((i): i is Prisma.JsonObject => !!i && typeof i === 'object' && !Array.isArray(i))
            .map(i => ({ text: typeof i.text === 'string' ? i.text : '', checked: i.checked === true }));
    }

    private toDto(note: CarNote): CarNoteDto {
        // Lazy legacy migration: pre-labels notes surface their group_name as the single label.
        const labels = note.labels.length === 0 && note.group_name?.trim()
            ? [note.group_name.trim()]
            : note.labels;
        return {
            ...note,
            labels,
            items: this.readItems(note.items),
        };
    }
}
