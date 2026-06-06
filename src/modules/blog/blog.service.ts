import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BlogEntry, Prisma } from '@prisma/client';
import { CreateBlogEntryDto } from './dto/create-blog-entry.dto';
import { UpdateBlogEntryDto } from './dto/update-blog-entry.dto';
import { GetBlogEntriesDto } from './dto/get-blog-entries.dto';
import { BlogEntryDto, BlogImageDto, BlogTagDto, VehicleCategoryDto } from './dto/blog-entry.dto';
import { VehicleEntryCategory, VEHICLE_CATEGORY_LABELS } from './enum/vehicle-entry-category.enum';
import { BlogCategory } from './enum/blog-category.enum';
import { BlogStatus } from './enum/blog-status.enum';

type BlogEntryWithRelations = BlogEntry & {
  tags: { id: number; label: string; color: string }[];
  images: { id: number; url: string }[];
  car: { make: string; model: string } | null;
};

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  async getEntries(userId: number, filters: GetBlogEntriesDto): Promise<BlogEntryDto[]> {
    const where: Prisma.BlogEntryWhereInput = { user_id: userId };

    if (filters.category)         where.category         = filters.category;
    if (filters.car_id != null)   where.car_id           = filters.car_id;
    if (filters.vehicle_category) where.vehicle_category = filters.vehicle_category;
    if (filters.is_pinned != null) where.is_pinned       = filters.is_pinned;
    if (filters.search) {
      where.OR = [
        { title:   { contains: filters.search, mode: 'insensitive' } },
        { content: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const entries = await this.prisma.blogEntry.findMany({
      where,
      include: { tags: true, images: true, car: { select: { make: true, model: true } } },
      orderBy: [{ is_pinned: 'desc' }, { date: 'desc' }],
    });

    return entries.map(e => this._toDto(e));
  }

  async getEntry(id: number, userId: number): Promise<BlogEntryDto> {
    const entry = await this.prisma.blogEntry.findFirst({
      where: { id, user_id: userId },
      include: { tags: true, images: true, car: { select: { make: true, model: true } } },
    });
    if (!entry) throw new NotFoundException(`Blog entry ${id} not found`);
    return this._toDto(entry);
  }

  async createEntry(userId: number, dto: CreateBlogEntryDto): Promise<BlogEntryDto> {
    if (dto.category === BlogCategory.VEHICLE && !dto.car_id) {
      throw new BadRequestException('car_id is required for VEHICLE journal entries');
    }
    if (dto.car_id != null) {
      await this._assertCarAccess(dto.car_id, userId);
    }

    const isPublishing = dto.status === BlogStatus.PUBLISHED;
    const entry = await this.prisma.blogEntry.create({
      data: {
        user:             { connect: { id: userId } },
        category:         dto.category,
        title:            dto.title,
        slug:             dto.slug,
        excerpt:          dto.excerpt,
        date:             new Date(dto.date),
        content:          dto.content ?? '',
        content_json:     dto.content_json as Prisma.InputJsonValue ?? Prisma.JsonNull,
        status:           dto.status ?? BlogStatus.DRAFT,
        published_at:     isPublishing ? new Date() : null,
        is_pinned:        dto.is_pinned ?? false,
        cover_gradient:   dto.cover_gradient,
        cover_image_url:  dto.cover_image_url,
        car:              dto.car_id != null ? { connect: { id: dto.car_id } } : undefined,
        vehicle_category: dto.vehicle_category,
        km:               dto.km,
        price:            dto.price,
        tags: dto.tags?.length
          ? { create: dto.tags.map(t => ({ label: t.label, color: t.color })) }
          : undefined,
        images: dto.images?.length
          ? { create: dto.images.map(url => ({ url })) }
          : undefined,
      },
      include: { tags: true, images: true, car: { select: { make: true, model: true } } },
    });
    return this._toDto(entry);
  }

  async updateEntry(id: number, userId: number, dto: UpdateBlogEntryDto): Promise<BlogEntryDto> {
    const existing = await this._assertOwner(id, userId);

    if (dto.car_id != null) {
      await this._assertCarAccess(dto.car_id, userId);
    }

    const isPublishing = dto.status === BlogStatus.PUBLISHED && existing.status !== 'PUBLISHED';
    const entry = await this.prisma.blogEntry.update({
      where: { id },
      data: {
        ...(dto.category         != null && { category:         dto.category }),
        ...(dto.title            != null && { title:            dto.title }),
        ...(dto.slug             != null && { slug:             dto.slug }),
        ...(dto.excerpt          != null && { excerpt:          dto.excerpt }),
        ...(dto.date             != null && { date:             new Date(dto.date) }),
        ...(dto.content          != null && { content:          dto.content }),
        ...(dto.content_json     != null && { content_json:     dto.content_json as Prisma.InputJsonValue }),
        ...(dto.status           != null && { status:           dto.status }),
        ...(isPublishing         && { published_at: new Date() }),
        ...(dto.is_pinned        != null && { is_pinned:        dto.is_pinned }),
        ...(dto.cover_gradient   != null && { cover_gradient:   dto.cover_gradient }),
        ...(dto.cover_image_url  != null && { cover_image_url:  dto.cover_image_url }),
        ...(dto.car_id           != null && { car_id:           dto.car_id }),
        ...(dto.vehicle_category != null && { vehicle_category: dto.vehicle_category }),
        ...(dto.km               != null && { km:               dto.km }),
        ...(dto.price            != null && { price:            dto.price }),
        ...(dto.tags != null && {
          tags: {
            deleteMany: {},
            create: dto.tags.map(t => ({ label: t.label, color: t.color })),
          },
        }),
        ...(dto.images != null && {
          images: {
            deleteMany: {},
            create: dto.images.map(url => ({ url })),
          },
        }),
      },
      include: { tags: true, images: true, car: { select: { make: true, model: true } } },
    });
    return this._toDto(entry);
  }

  async deleteEntry(id: number, userId: number): Promise<BlogEntryDto> {
    await this._assertOwner(id, userId);
    const entry = await this.prisma.blogEntry.delete({
      where: { id },
      include: { tags: true, images: true, car: { select: { make: true, model: true } } },
    });
    return this._toDto(entry);
  }

  async togglePin(id: number, userId: number): Promise<BlogEntryDto> {
    const entry = await this._assertOwner(id, userId);
    return this.updateEntry(id, userId, { is_pinned: !entry.is_pinned });
  }

  getVehicleCategories(): VehicleCategoryDto[] {
    return Object.values(VehicleEntryCategory).map(value => ({
      value,
      label: VEHICLE_CATEGORY_LABELS[value],
    }));
  }

  private async _assertOwner(id: number, userId: number) {
    const entry = await this.prisma.blogEntry.findFirst({ where: { id, user_id: userId } });
    if (!entry) throw new NotFoundException(`Blog entry ${id} not found`);
    return entry;
  }

  private async _assertCarAccess(carId: number, userId: number): Promise<void> {
    const car = await this.prisma.car.findFirst({ where: { id: carId } });
    if (!car) throw new NotFoundException(`Car ${carId} not found`);
    if (car.user_id === userId) return;
    const access = await this.prisma.carUserAccess.findFirst({ where: { car_id: carId, user_id: userId } });
    if (!access) throw new BadRequestException(`You do not have access to car ${carId}`);
  }

  private _toDto(e: BlogEntryWithRelations): BlogEntryDto {
    const carName = e.car ? `${e.car.make} ${e.car.model}` : null;
    return {
      id:               e.id,
      user_id:          e.user_id,
      category:         e.category as any,
      title:            e.title,
      slug:             (e as any).slug ?? null,
      excerpt:          (e as any).excerpt ?? null,
      date:             e.date.toISOString(),
      content:          e.content,
      content_json:     (e as any).content_json ?? null,
      status:           ((e as any).status ?? BlogStatus.DRAFT) as any,
      published_at:     (e as any).published_at ? new Date((e as any).published_at).toISOString() : null,
      is_pinned:        e.is_pinned,
      cover_gradient:   e.cover_gradient ?? null,
      cover_image_url:  (e as any).cover_image_url ?? null,
      car_id:           e.car_id ?? null,
      car_name:         carName,
      vehicle_category: e.vehicle_category as any ?? null,
      km:               e.km ?? null,
      price:            e.price ?? null,
      tags:             e.tags.map((t): BlogTagDto => ({ id: t.id, label: t.label, color: t.color })),
      images:           e.images.map((i): BlogImageDto => ({ id: i.id, url: i.url })),
      created_at:       e.created_at.toISOString(),
      updated_at:       e.updated_at.toISOString(),
    };
  }
}
