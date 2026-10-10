import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { Prisma, VehicleSilhouetteStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { extractSvg, sanitizeSvg } from './svg-sanitizer';

export interface VehicleSilhouetteResult {
  status: VehicleSilhouetteStatus;
  svg: string | null;
}

const MAX_ATTEMPTS = 3;
const FAILED_RETRY_MS = 10 * 60 * 1000;
const STALE_PENDING_MS = 5 * 60 * 1000;
const NEW_GENERATIONS_PER_USER_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;
const MAX_NAME_LENGTH = 60;

const PROMPT = (make: string, model: string) => `Output ONLY a single SVG, no prose and no code fences: a minimal schematic side-profile silhouette of a ${make} ${model}, facing left.

Strict rules:
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100">
- Flat filled body shape built from a few <path>/<polygon>/<rect> elements plus two wheel <circle> elements.
- Every fill is fill="currentColor". Wheels may be cut out of the body with a different fill-opacity or opacity (e.g. 0.35), never another color.
- No text, no gradients, no filters, no clip paths, no <style>, no external references, no raster images, no strokes with colors.
- Recognizable body type and proportions for this exact model (sedan, hatchback, estate, SUV, van, pickup...), simple and clean, enterprise-looking, ground line near y=88, vehicle spanning most of the width.`;

/** lowercase, trimmed, whitespace collapsed, diacritics stripped. */
export function normalizeVehicleName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

@Injectable()
export class VehicleSilhouetteService {
  private readonly logger = new Logger(VehicleSilhouetteService.name);
  private readonly client: GoogleGenAI | null;
  private readonly model: string;
  // In-memory abuse guard: timestamps of generations each user has triggered in the last hour.
  private readonly userTriggers = new Map<number, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    this.model = this.config.get<string>('GEMINI_MODEL') || 'gemini-3.6-flash';
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
    if (!this.client) this.logger.warn('GEMINI_API_KEY is not set — vehicle silhouette generation is disabled.');
  }

  /** Returns the stored silhouette, kicking off background generation if it is missing (or retryable). */
  async getOrTrigger(userId: number, makeRaw: string, modelRaw: string): Promise<VehicleSilhouetteResult> {
    const { make, model, makeKey, modelKey } = this.parseNames(makeRaw, modelRaw);
    const where = { make_normalized_model_normalized: { make_normalized: makeKey, model_normalized: modelKey } };
    const existing = await this.prisma.vehicleSilhouette.findUnique({ where });

    if (!existing) {
      this.assertRateLimit(userId);
      try {
        const created = await this.prisma.vehicleSilhouette.create({
          data: {
            make_normalized: makeKey,
            model_normalized: modelKey,
            make_display: make,
            model_display: model,
            status: 'PENDING',
            attempts: 1,
          },
        });
        this.recordTrigger(userId);
        this.runInBackground(created.id, make, model);
        return { status: 'PENDING', svg: null };
      } catch (err) {
        // Lost the race to a concurrent request: the unique row exists now, just report it.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const row = await this.prisma.vehicleSilhouette.findUnique({ where });
          return this.toResult(row);
        }
        throw err;
      }
    }

    if (existing.status === 'READY') return this.toResult(existing);

    const age = Date.now() - existing.updated_at.getTime();
    const retryable =
      existing.attempts < MAX_ATTEMPTS &&
      ((existing.status === 'FAILED' && age >= FAILED_RETRY_MS) || (existing.status === 'PENDING' && age >= STALE_PENDING_MS));
    if (!retryable) return this.toResult(existing);

    this.assertRateLimit(userId);
    // Optimistic claim: only one concurrent request wins the transition (updated_at must be unchanged).
    const claimed = await this.prisma.vehicleSilhouette.updateMany({
      where: { id: existing.id, status: existing.status, updated_at: existing.updated_at },
      data: { status: 'PENDING', attempts: { increment: 1 }, error: null },
    });
    if (claimed.count === 1) {
      this.recordTrigger(userId);
      this.runInBackground(existing.id, existing.make_display, existing.model_display);
    }
    return { status: 'PENDING', svg: null };
  }

  /** Admin: throw away the current silhouette and generate a fresh one (old one stays if the new attempt fails). */
  async regenerate(makeRaw: string, modelRaw: string): Promise<VehicleSilhouetteResult> {
    const { make, model, makeKey, modelKey } = this.parseNames(makeRaw, modelRaw);
    const row = await this.prisma.vehicleSilhouette.upsert({
      where: { make_normalized_model_normalized: { make_normalized: makeKey, model_normalized: modelKey } },
      create: {
        make_normalized: makeKey,
        model_normalized: modelKey,
        make_display: make,
        model_display: model,
        status: 'PENDING',
        attempts: 1,
      },
      update: { status: 'PENDING', attempts: 1, error: null },
    });
    this.runInBackground(row.id, row.make_display, row.model_display);
    return { status: 'PENDING', svg: null };
  }

  /** Runs generation to completion and persists the outcome. Awaitable for scripts/tests. */
  async generate(id: number, make: string, model: string): Promise<void> {
    try {
      if (!this.client) throw new Error('GEMINI_API_KEY is not configured');
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: PROMPT(make, model) }] }],
        config: { temperature: 0.4, httpOptions: { timeout: 60_000 } },
      });
      const raw = extractSvg(response.text ?? '');
      if (!raw) throw new Error('Model response contained no <svg>');
      const svg = sanitizeSvg(raw);
      await this.prisma.vehicleSilhouette.update({
        where: { id },
        data: { svg, status: 'READY', source: 'gemini', error: null },
      });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      this.logger.error(`Silhouette generation failed for ${make} ${model}: ${message}`);
      // A failed regeneration must not blank out a previously good silhouette.
      const current = await this.prisma.vehicleSilhouette.findUnique({ where: { id }, select: { svg: true } });
      await this.prisma.vehicleSilhouette
        .update({ where: { id }, data: { status: current?.svg ? 'READY' : 'FAILED', error: message } })
        .catch(() => undefined);
    }
  }

  private runInBackground(id: number, make: string, model: string): void {
    void this.generate(id, make, model);
  }

  private toResult(row: { status: VehicleSilhouetteStatus; svg: string | null } | null): VehicleSilhouetteResult {
    if (!row) return { status: 'PENDING', svg: null };
    return { status: row.status, svg: row.status === 'READY' ? row.svg : null };
  }

  private parseNames(makeRaw: string, modelRaw: string) {
    const make = (makeRaw ?? '').trim().replace(/\s+/g, ' ');
    const model = (modelRaw ?? '').trim().replace(/\s+/g, ' ');
    if (!make || !model || make.length > MAX_NAME_LENGTH || model.length > MAX_NAME_LENGTH) {
      throw new HttpException('make and model are required (max 60 characters each)', HttpStatus.BAD_REQUEST);
    }
    // These go into an LLM prompt: keep to plain name characters so they can't carry instructions.
    const namePattern = /^[\p{L}\p{N} .\-+/&'()]+$/u;
    if (!namePattern.test(make) || !namePattern.test(model)) {
      throw new HttpException('make/model contain invalid characters', HttpStatus.BAD_REQUEST);
    }
    return { make, model, makeKey: normalizeVehicleName(make), modelKey: normalizeVehicleName(model) };
  }

  private recentTriggers(userId: number): number[] {
    const cutoff = Date.now() - HOUR_MS;
    const recent = (this.userTriggers.get(userId) ?? []).filter((t) => t > cutoff);
    this.userTriggers.set(userId, recent);
    return recent;
  }

  private assertRateLimit(userId: number): void {
    if (this.recentTriggers(userId).length >= NEW_GENERATIONS_PER_USER_PER_HOUR) {
      throw new HttpException('Too many silhouette generations, try again later', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private recordTrigger(userId: number): void {
    this.recentTriggers(userId).push(Date.now());
  }
}
