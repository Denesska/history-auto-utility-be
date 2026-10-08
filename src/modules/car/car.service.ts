import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Car, CarAccessRole, CarPhoto, CarStatus, FuelType, NotificationType, OrganizationRole, Prisma, ServiceCategory, ServiceType, TransmissionType } from '@prisma/client';
import { getRequestSessionContext } from '../../common/context/request-context';
import { ROLE_RANK } from '../../common/guards/car-access/car-access.guard';
import { formatLicensePlate, normalizePlateForComparison } from '../../common/util/license-plate.util';
import { CarAccessService } from '../car-access/car-access.service';
import { CarDto, CarPhotoDto } from './dto/car.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AddCarDto } from './dto/add-car.dto';
import { ImportRowResultDto } from './dto/import-cars-result.dto';
import { ImportRow } from './fleet-import.util';
import { NotificationsService } from '../notifications/notifications.service';

type CarWithPhotos = Car & { photos: CarPhoto[] };

/**
 * The only business roles allowed to add a car to an organization's fleet — single create
 * (`CarController.createCar`'s `@BusinessRoles`) and the org admin's bulk import (`createCar`
 * called once per row, see `importCars` below) share this exact set, checked with `.includes()`
 * instead of a rank comparison: `ORG_ROLE_RANK` gives FLEET_ADMIN/FINANCE/MANAGER the same
 * rank (they're peers, not ranked against each other — see that file's doc), so a rank-based
 * check can't single out FLEET_ADMIN without also admitting FINANCE/MANAGER. See "Adding a
 * car" in ACCOUNT-CONTEXT.md.
 */
export const CAR_CREATE_ROLES: readonly OrganizationRole[] = [
  OrganizationRole.OWNER,
  OrganizationRole.SUPER_ADMIN,
  OrganizationRole.FLEET_ADMIN,
];

@Injectable()
export class CarService {
  private readonly logger = new Logger(CarService.name);

  constructor(
    private prisma: PrismaService,
    private carAccessService: CarAccessService,
    private storage: StorageService,
    private notificationsService: NotificationsService,
  ) {}

  private async notifyVinConflictIfNeeded(vin: string | null | undefined, ownerIdToExclude: number): Promise<void> {
    if (!vin) return;
    try {
      const existingCar = await this.prisma.car.findUnique({ where: { vin } });
      if (!existingCar || existingCar.user_id === ownerIdToExclude) return;
      // Shown only to this car's own owner, about their own car — safe to resolve
      // their own private label (see CarUserNickname), never anyone else's.
      const myNickname = await this.getMyNickname(existingCar.id, existingCar.user_id);
      const carLabel = myNickname ?? `${existingCar.make} ${existingCar.model}`.trim();
      await this.notificationsService.create(existingCar.user_id, NotificationType.VIN_CONFLICT, {
        carId: existingCar.id,
        carLabel,
        vin,
      });
    } catch (e) {
      this.logger.error(`Failed to notify owner of VIN conflict for vin=${vin}`, e instanceof Error ? e.stack : String(e));
    }
  }

  private async notifyLicensePlateConflictIfNeeded(
    licensePlate: string | null | undefined,
    excludeCarId: number,
    ownerIdToExclude: number,
  ): Promise<void> {
    if (!licensePlate) return;
    const normalized = normalizePlateForComparison(licensePlate);
    if (!normalized) return;
    try {
      // Normalization-insensitive: an existing row saved before plates were
      // formatted consistently (see formatLicensePlate) may still be in a
      // different spacing/case, so this can't be a plain equality match.
      const [existingCar] = await this.prisma.$queryRaw<{ id: number; user_id: number; make: string; model: string }[]>`
        SELECT id, user_id, make, model
        FROM "Car"
        WHERE status = 'ACTIVE'
          AND id != ${excludeCarId}
          AND user_id != ${ownerIdToExclude}
          AND license_plate IS NOT NULL
          AND UPPER(REGEXP_REPLACE(license_plate, '[^A-Za-z0-9]', '', 'g')) = ${normalized}
        LIMIT 1
      `;
      if (!existingCar) return;
      // Same reasoning as notifyVinConflictIfNeeded — the recipient is this car's
      // own owner, so their own private label is safe to show them.
      const myNickname = await this.getMyNickname(existingCar.id, existingCar.user_id);
      const carLabel = myNickname ?? `${existingCar.make} ${existingCar.model}`.trim();
      await this.notificationsService.create(existingCar.user_id, NotificationType.LICENSE_PLATE_CONFLICT, {
        carId: existingCar.id,
        carLabel,
        licensePlate,
      });
    } catch (e) {
      this.logger.error(`Failed to notify owner of license plate conflict for plate=${licensePlate}`, e instanceof Error ? e.stack : String(e));
    }
  }

  // ── Private per-viewer nicknames (CarUserNickname) ────────────────────────
  // A car's "name" is private per viewing user now, not one shared global
  // value — see CarUserNickname in schema.prisma and the deprecation note on
  // Car.nickname. Nothing below ever reads or writes the old column.

  private async userIdFromGoogleId(googleId: string): Promise<number | null> {
    const user = await this.prisma.user.findUnique({ where: { google_id: googleId } });
    return user?.id ?? null;
  }

  private async getMyNickname(carId: number, userId: number): Promise<string | null> {
    const row = await this.prisma.carUserNickname.findUnique({
      where: { car_id_user_id: { car_id: carId, user_id: userId } },
    });
    return row?.nickname ?? null;
  }

  /** Batched version of getMyNickname for a list of cars — one query instead of N. */
  private async getMyNicknamesMap(carIds: number[], userId: number): Promise<Map<number, string>> {
    if (carIds.length === 0) return new Map();
    const rows = await this.prisma.carUserNickname.findMany({
      where: { user_id: userId, car_id: { in: carIds } },
    });
    return new Map(rows.map(r => [r.car_id, r.nickname]));
  }

  /**
   * `nickname === undefined` means "the caller didn't send this field at all" —
   * left untouched. `null`/empty string clears the viewer's label (row deleted,
   * display falls back to make+model); any other string sets/replaces it.
   * Private per (car, user) pair — never globally unique, unlike the old column.
   */
  private async setMyNickname(carId: number, userId: number, nickname: string | null | undefined): Promise<void> {
    if (nickname === undefined) return;
    const trimmed = nickname?.trim();
    if (!trimmed) {
      await this.prisma.carUserNickname.deleteMany({ where: { car_id: carId, user_id: userId } });
      return;
    }
    await this.prisma.carUserNickname.upsert({
      where: { car_id_user_id: { car_id: carId, user_id: userId } },
      create: { car_id: carId, user_id: userId, nickname: trimmed },
      update: { nickname: trimmed },
    });
  }

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
    // `nickname` is pulled out here and never written to the Car row — it
    // becomes the creator's own private label (setMyNickname below), not a
    // column on the car itself. See CarUserNickname.
    const { id, default_new_photo_index, organizationId: requestedOrganizationId, nickname, ...carData } = data as any;

    // Stored in this formatted shape from here on (uppercase, letter/digit
    // groups separated by a single space) — see formatLicensePlate. Existing
    // rows saved before this were never rewritten, so a lookup against them
    // must stay normalization-insensitive (see normalizePlateForComparison).
    if (carData.license_plate) {
      carData.license_plate = formatLicensePlate(carData.license_plate);
    }

    // Where the car lives is decided by the session context, never by the
    // client: business -> always the session's organization, personal -> always
    // personal (null), whatever `organizationId` was sent. Only a caller outside
    // an HTTP request (no context) may pass it explicitly.
    const sessionCtx = getRequestSessionContext();
    const organizationId: number | null | undefined = sessionCtx
      ? (sessionCtx.type === 'business' ? sessionCtx.orgId : null)
      : requestedOrganizationId;

    // Creating a car directly inside an organization — the only way a car
    // enters a fleet; there's no "attach one of my personal cars" path, so a
    // company asset never has to have been someone's personal property
    // first. Restricted to CAR_CREATE_ROLES (OWNER/SUPER_ADMIN/FLEET_ADMIN) —
    // the same set CarController.createCar's @BusinessRoles enforces for a plain
    // HTTP request; this check is what actually covers importCars (bulk import
    // has no @BusinessRoles of its own, it calls createCar once per row).
    if (organizationId != null) {
      const membership = await this.prisma.organizationMembership.findUnique({
        where: { organization_id_user_id: { organization_id: Number(organizationId), user_id: user.id } },
      });
      if (!membership?.accepted_at || !CAR_CREATE_ROLES.includes(membership.role)) {
        throw new ForbiddenException('Only an owner, super admin or fleet admin can add a car directly to the organization');
      }
      if (carData.license_plate) {
        const normalizedPlate = normalizePlateForComparison(carData.license_plate);
        const [conflict] = normalizedPlate
          ? await this.prisma.$queryRaw<{ organization_id: number | null }[]>`
              SELECT organization_id
              FROM "Car"
              WHERE status = 'ACTIVE'
                AND organization_id IS NOT NULL
                AND license_plate IS NOT NULL
                AND UPPER(REGEXP_REPLACE(license_plate, '[^A-Za-z0-9]', '', 'g')) = ${normalizedPlate}
              LIMIT 1
            `
          : [];
        if (conflict && conflict.organization_id !== Number(organizationId)) {
          throw new ConflictException({ code: 'CAR_ORG_PLATE_CONFLICT', message: 'A car with this license plate already belongs to another fleet' });
        }
      }
    }

    let car: CarWithPhotos;
    try {
      car = await this.prisma.$transaction(async (tx) => {
        const createdCar = await tx.car.create({
          data: {
            ...carData,
            ownership_start_date: carData.ownership_start_date ? new Date(carData.ownership_start_date) : null,
            rca_expiry_date: carData.rca_expiry_date ? new Date(carData.rca_expiry_date) : null,
            itp_expiry_date: carData.itp_expiry_date ? new Date(carData.itp_expiry_date) : null,
            rov_expiry_date: carData.rov_expiry_date ? new Date(carData.rov_expiry_date) : null,
            last_oil_service_date: carData.last_oil_service_date ? new Date(carData.last_oil_service_date) : null,
            user_id: user.id,
            organization_id: organizationId != null ? Number(organizationId) : null,
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
        });

        // A last-oil-change baseline entered on the add-car form only ever lived on
        // Car.last_oil_service_* — the maintenance Plan (buildPlanItems) reads the
        // latest MaintenanceRecord with service_category OIL_CHANGE and never looked
        // at those columns, so the baseline was silently ignored until the car's
        // *next* real oil-change record. Mirror it into a real record here, once, at
        // creation time only (never on edit — see updateCar) so the Plan has
        // something to count down from immediately. Columns are left as-is; this
        // is purely additive.
        if (carData.last_oil_service_date || carData.last_oil_service_mileage != null) {
          await tx.maintenanceRecord.create({
            data: {
              car_id: createdCar.id,
              service_date: carData.last_oil_service_date ? new Date(carData.last_oil_service_date) : new Date(),
              mileage: carData.last_oil_service_mileage ?? null,
              description: '',
              service_type: ServiceType.MAINTENANCE,
              service_category: ServiceCategory.OIL_CHANGE,
              cost: 0,
            },
          });
        }

        return createdCar;
      }) as CarWithPhotos;
    } catch (e: any) {
      if (e?.code === 'P2002' && e?.meta?.target?.includes('vin')) {
        await this.notifyVinConflictIfNeeded(carData.vin, user.id);
        throw new ConflictException({ code: 'CAR_VIN_CONFLICT', message: 'A car with this VIN already exists' });
      }
      throw e;
    }

    await this.notifyLicensePlateConflictIfNeeded(car.license_plate, car.id, car.user_id);

    // The creator's own private label for their new car — never a shared value.
    await this.setMyNickname(car.id, user.id, nickname);

    return this.toCarDto(car, nickname?.trim() || null);
  }

  async getCar(id: number, userId: number): Promise<CarDto | null> {
    const car = await this.prisma.car.findUnique({
      where: { id },
      include: { photos: true },
    });
    if (!car) return null;
    try {
      await this.carAccessService.assertHasAccess(id, userId);
    } catch {
      return null;
    }
    const myNickname = await this.getMyNickname(id, userId);
    return await this.toCarDto(car as CarWithPhotos, myNickname);
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
    let actingUserId: number | null = null;
    if (googleId) {
      const role = await this.carAccessService.resolveUserRole(id, googleId);
      if (ROLE_RANK[role] < ROLE_RANK[CarAccessRole.USER]) {
        throw new ForbiddenException('Insufficient permissions to edit this car');
      }
      actingUserId = await this.userIdFromGoogleId(googleId);
    }

    // `nickname` never reaches the Car row — it's the acting viewer's own
    // private label (setMyNickname below), not a shared column. See
    // CarUserNickname.
    // `organizationId` is dropped too: a car never moves between personal and a fleet via update.
    const { nickname, organizationId: _ignoredOrganizationId, ...rest } = data as any;
    const updateData: Prisma.CarUpdateInput = { ...rest };

    // Same formatting as createCar — see the comment there.
    if (typeof updateData.license_plate === 'string' && updateData.license_plate) {
      updateData.license_plate = formatLicensePlate(updateData.license_plate);
    }

    if (updateData.actual_mileage !== undefined) {
      updateData.actual_mileage_updated_at = new Date();
    }

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
      if (e?.code === 'P2002' && e?.meta?.target?.includes('vin')) {
        const targetCar = await this.prisma.car.findUnique({ where: { id }, select: { user_id: true } });
        if (targetCar) {
          await this.notifyVinConflictIfNeeded(updateData.vin as string | undefined, targetCar.user_id);
        }
        throw new ConflictException({ code: 'CAR_VIN_CONFLICT', message: 'A car with this VIN already exists' });
      }
      throw e;
    }

    await this.notifyLicensePlateConflictIfNeeded(car.license_plate, car.id, car.user_id);

    // The acting viewer's own private label. Falls back to the car's owner
    // only when no actor could be resolved (shouldn't happen through the
    // controller, which always supplies a google_id).
    const nicknameOwnerId = actingUserId ?? car.user_id;
    await this.setMyNickname(id, nicknameOwnerId, nickname);
    const myNickname = nickname !== undefined
      ? (nickname?.trim() || null)
      : await this.getMyNickname(id, nicknameOwnerId);

    return await this.toCarDto(car, myNickname);
  }

  /**
   * Loads the photo (404 if missing) and requires the same write role as
   * `PUT /car` (USER or above) on the photo's car, resolved in the current
   * session context (personal vs. business) — a photo id alone must never be
   * enough to touch another car's photos.
   */
  private async loadPhotoForEdit(photoId: number, userId: number): Promise<CarPhoto> {
    const photo = await this.prisma.carPhoto.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('Photo not found');
    const role = await this.carAccessService.resolveUserRoleById(photo.car_id, userId);
    if (ROLE_RANK[role] < ROLE_RANK[CarAccessRole.USER]) {
      throw new ForbiddenException('Insufficient permissions to edit this car');
    }
    return photo;
  }

  async deletePhoto(photoId: number, userId: number): Promise<void> {
    await this.loadPhotoForEdit(photoId, userId);
    await this.prisma.carPhoto.delete({ where: { id: photoId } });
  }

  async setDefaultPhoto(photoId: number, userId: number): Promise<void> {
    const photo = await this.loadPhotoForEdit(photoId, userId);
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
    let actingUserId: number | null = null;
    if (googleId) {
      const role = await this.carAccessService.resolveUserRole(id, googleId);
      if (role !== CarAccessRole.OWNER) {
        throw new ForbiddenException('Only the owner can archive this car');
      }
      actingUserId = await this.userIdFromGoogleId(googleId);
    }
    const car = await this.prisma.car.update({
      where: { id },
      data: { status: CarStatus.SOLD, sold_at: new Date() },
      include: { photos: true },
    });
    const myNickname = await this.getMyNickname(id, actingUserId ?? car.user_id);
    return await this.toCarDto(car as CarWithPhotos, myNickname);
  }

  async restoreCar(id: number, googleId?: string): Promise<CarDto> {
    let actingUserId: number | null = null;
    if (googleId) {
      const role = await this.carAccessService.resolveUserRole(id, googleId);
      if (role !== CarAccessRole.OWNER) {
        throw new ForbiddenException('Only the owner can restore this car');
      }
      actingUserId = await this.userIdFromGoogleId(googleId);
    }
    const car = await this.prisma.car.update({
      where: { id },
      data: { status: CarStatus.ACTIVE, sold_at: null },
      include: { photos: true },
    });
    const myNickname = await this.getMyNickname(id, actingUserId ?? car.user_id);
    return await this.toCarDto(car as CarWithPhotos, myNickname);
  }

  async deleteCar(id: number, googleId?: string): Promise<CarDto> {
    let actingUserId: number | null = null;
    if (googleId) {
      const role = await this.carAccessService.resolveUserRole(id, googleId);
      if (role !== CarAccessRole.OWNER) {
        throw new ForbiddenException('Only the owner can delete this car');
      }
      actingUserId = await this.userIdFromGoogleId(googleId);
    }
    // Resolved before the delete — CarUserNickname rows for this car cascade
    // away together with it, so there'd be nothing left to read afterward.
    const existing = await this.prisma.car.findUnique({ where: { id } });
    const myNickname = existing ? await this.getMyNickname(id, actingUserId ?? existing.user_id) : null;
    const car = await this.prisma.car.delete({
      where: { id },
      include: { photos: true },
    });
    return await this.toCarDto(car as CarWithPhotos, myNickname);
  }

  /**
   * The cars of the current session context. Personal: the user's own cars with
   * `organization_id` NULL (unchanged). Business: the active organization's
   * fleet (a DRIVER only sees currently assigned cars) — resolved through
   * `CarAccessService.getAccessibleCarIds`, the single source for that rule.
   */
  async getAllCars(google_id: string): Promise<CarDto[]> {
    const user = await this.prisma.user.findUnique({
      where: { google_id },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const ctx = getRequestSessionContext();
    const where: Prisma.CarWhereInput = ctx?.type === 'business'
      ? { id: { in: await this.carAccessService.getAccessibleCarIds(user.id) } }
      : { user_id: user.id, organization_id: null };

    const cars = await this.prisma.car.findMany({
      where,
      include: { photos: true },
    });
    const nicknames = await this.getMyNicknamesMap(cars.map(c => c.id), user.id);
    return Promise.all(cars.map(car => this.toCarDto(car as CarWithPhotos, nicknames.get(car.id) ?? null)));
  }

  /** Personal cars (organization_id NULL) of a user; the controller only lets callers ask for themselves. */
  async getCarsByUser(userId: number): Promise<CarDto[]> {
    const cars = await this.prisma.car.findMany({
      where: { user_id: userId, organization_id: null },
      include: { photos: true },
    });
    const nicknames = await this.getMyNicknamesMap(cars.map(c => c.id), userId);
    return Promise.all(cars.map(car => this.toCarDto(car as CarWithPhotos, nicknames.get(car.id) ?? null)));
  }

  /** `myNickname` is the resolved viewer-private label (or null) — see getMyNickname/getMyNicknamesMap. Never reads car.nickname. */
  private async toCarDto(car: CarWithPhotos, myNickname: string | null): Promise<CarDto> {
    const photos = await Promise.all(
      car.photos.map(async (p: CarPhoto): Promise<CarPhotoDto> => ({
        id: p.id,
        url: await this.resolveUrl(p.url),
        is_default: p.is_default,
      })),
    );
    return {
      id: car.id,
      user_id: car.user_id,
      vin: car.vin,
      nickname: myNickname,
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
      actual_mileage: car.actual_mileage,
      actual_mileage_updated_at: car.actual_mileage_updated_at,
      ownership_start_date: car.ownership_start_date,
      rca_expiry_date: car.rca_expiry_date,
      itp_expiry_date: car.itp_expiry_date,
      rov_expiry_date: car.rov_expiry_date,
      last_oil_service_date: car.last_oil_service_date,
      last_oil_service_mileage: car.last_oil_service_mileage,
      status: car.status,
      sold_at: (car as any).sold_at ?? null,
      photos,
    };
  }

  /** Public so other modules (e.g. OrganizationService's company-cars list) resolve a stored photo path the same way, instead of re-deriving it. */
  resolveUrl(url: string | null): Promise<string | null> | string | null {
    if (!url || url.startsWith('/') || url.startsWith('http')) return url;
    return this.storage.createPresignedGetUrl(url);
  }

  /**
   * Bulk-creates cars directly inside an organization's fleet from a parsed
   * import file (see `fleet-import.util.ts`) — one `createCar` call per row,
   * so every row gets the exact same authorization (Director-tier only) and
   * conflict checks (duplicate plate/VIN) as adding a single company car.
   * A bad row (missing make/model, a conflict, an invalid enum value)
   * fails that row only — the rest of the file still gets imported.
   */
  async importCars(rows: ImportRow[], organizationId: number, google_id: string): Promise<ImportRowResultDto[]> {
    const results: ImportRowResultDto[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 1;
      const row = rows[i];
      const make = row.make?.trim();
      const model = row.model?.trim();

      if (!make || !model) {
        results.push({ row: rowNumber, success: false, error: 'Missing required field: make and/or model' });
        continue;
      }

      const year = row.year ? Number(row.year) : undefined;
      const current_mileage = row.current_mileage ? Number(row.current_mileage) : undefined;
      const fuel_type = row.fuel_type && (Object.values(FuelType) as string[]).includes(row.fuel_type.toUpperCase())
        ? (row.fuel_type.toUpperCase() as FuelType) : undefined;
      const transmission = row.transmission && (Object.values(TransmissionType) as string[]).includes(row.transmission.toUpperCase())
        ? (row.transmission.toUpperCase() as TransmissionType) : undefined;

      const dto = {
        make,
        model,
        variant: row.variant?.trim() || undefined,
        year: year && !isNaN(year) ? year : undefined,
        license_plate: row.license_plate?.trim() || undefined,
        vin: row.vin?.trim() || undefined,
        nickname: row.nickname?.trim() || undefined,
        fuel_type,
        transmission,
        color: row.color?.trim() || undefined,
        current_mileage: current_mileage && !isNaN(current_mileage) ? current_mileage : undefined,
        organizationId,
      } as AddCarDto;

      try {
        const car = await this.createCar(dto, google_id);
        results.push({ row: rowNumber, success: true, carId: car.id, label: car.nickname ?? `${car.make} ${car.model}`.trim() });
      } catch (e: any) {
        const message = e?.response?.message ?? e?.message ?? 'Could not create this car';
        results.push({ row: rowNumber, success: false, error: Array.isArray(message) ? message.join(', ') : message });
      }
    }

    return results;
  }
}

