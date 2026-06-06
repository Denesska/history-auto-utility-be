import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MakeResponseDto } from './dto/make-response.dto';
import { ModelResponseDto } from './dto/model-response.dto';
import { YearResponseDto } from './dto/year-response.dto';

@Injectable()
export class VehicleCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getMakes(): Promise<MakeResponseDto[]> {
    const makes = await this.prisma.carMake.findMany({
      orderBy: { normalized_name: 'asc' },
    });
    return makes.map((m) => ({
      id: m.id,
      name: m.name,
      normalizedName: m.normalized_name,
    }));
  }

  async getModels(makeId: number): Promise<ModelResponseDto[]> {
    const models = await this.prisma.carCatalogModel.findMany({
      where: { make_id: makeId },
      orderBy: { normalized_name: 'asc' },
    });
    return models.map((m) => ({
      id: m.id,
      makeId: m.make_id,
      name: m.name,
      normalizedName: m.normalized_name,
    }));
  }

  async getYears(modelId: number): Promise<YearResponseDto[]> {
    const years = await this.prisma.carModelYear.findMany({
      where: { model_id: modelId },
      orderBy: { year: 'desc' },
    });
    return years.map((y) => ({
      id: y.id,
      modelId: y.model_id,
      year: y.year,
    }));
  }

  normalize(name: string): string {
    return name.trim().toLowerCase();
  }
}
