import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';

/** Masks everything but the last 6 characters, for push tokens in the export file. */
function maskToken(token: string): string {
  if (!token || token.length <= 6) return token;
  return `${'*'.repeat(token.length - 6)}${token.slice(-6)}`;
}

/**
 * GDPR data-subject rights for the calling user's own account: "download my data"
 * (Art. 15/20) and "delete my account" (Art. 17, also required by Google Play /
 * App Store for apps that support account creation).
 *
 * Scope is deliberately "the user as a person", not "everything their account can
 * see": business/organization data (the fleet, other members, other parties to a
 * sale contract) is never exported or deleted here — see ACCOUNT-CONTEXT.md.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly encryption: FieldEncryptionService,
  ) {}

  /**
   * Everything about the calling user as a person: profile, personal-context
   * (organization_id null) records they own, and account-level data that isn't
   * tied to any car or organization. Business/organization data is excluded —
   * that belongs to the organization, not to this export.
   */
  async exportMyData(userId: number): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, refresh_token, ...profile } = user as any;

    const [
      settings,
      cars,
      carNicknames,
      carMaintenanceSettings,
      maintenanceProfiles,
      sharedAsGrantee,
      sharedAsInviter,
      organizationMemberships,
      driverAssignments,
      blogEntries,
      suppliers,
      uploadedFiles,
      saleContracts,
      identityRow,
      notifications,
      pushTokens,
      businessAccessRequests,
      activityDays,
      featureInterests,
      legalConsents,
    ] = await Promise.all([
      this.prisma.userSettings.findUnique({ where: { user_id: userId } }),
      // Personal cars only (organization_id null) — fleet cars belong to the organization.
      this.prisma.car.findMany({
        where: { user_id: userId, organization_id: null },
        include: {
          documents: true,
          maintenanceRecords: { include: { parts: true } },
          notes: true,
          wishes: true,
          photos: true,
          // Scoped to this user: a shared car can have a different order per viewer.
          deadline_orders: { where: { user_id: userId } },
        },
      }),
      // Per-user overlays apply to any car the user can see (personal or a
      // fleet car they drive/were shared), not only personal ones.
      this.prisma.carUserNickname.findMany({ where: { user_id: userId } }),
      this.prisma.carMaintenanceSetting.findMany({ where: { user_id: userId } }),
      this.prisma.maintenanceProfile.findMany({ where: { user_id: userId } }),
      this.prisma.carUserAccess.findMany({
        where: { user_id: userId },
        include: { car: { select: { id: true, make: true, model: true, license_plate: true } } },
      }),
      this.prisma.carUserAccess.findMany({
        where: { invited_by_user_id: userId },
        include: { car: { select: { id: true, make: true, model: true, license_plate: true } } },
      }),
      this.prisma.organizationMembership.findMany({
        where: { user_id: userId },
        select: { role: true, accepted_at: true, created_at: true, organization: { select: { name: true } } },
      }),
      this.prisma.carDriverAssignment.findMany({
        where: { driver_user_id: userId },
        include: { car: { select: { id: true, make: true, model: true, license_plate: true } } },
      }),
      this.prisma.blogEntry.findMany({ where: { user_id: userId }, include: { tags: true, images: true } }),
      // Personal suppliers only — an org's supplier directory belongs to the organization.
      this.prisma.supplier.findMany({ where: { user_id: userId, organization_id: null } }),
      this.prisma.uploadedFile.findMany({ where: { user_id: userId } }),
      this.prisma.saleContract.findMany({ where: { user_id: userId }, include: { parties: true } }),
      this.prisma.userIdentity.findUnique({ where: { user_id: userId } }),
      this.prisma.notification.findMany({ where: { user_id: userId } }),
      this.prisma.pushToken.findMany({ where: { user_id: userId } }),
      this.prisma.businessAccessRequest.findMany({ where: { user_id: userId } }),
      this.prisma.userActivityDay.findMany({ where: { user_id: userId } }),
      this.prisma.featureInterest.findMany({ where: { user_id: userId } }),
      this.prisma.userLegalConsent.findMany({ where: { user_id: userId } }),
    ]);

    // The user's own saved identity (used to pre-fill sale contracts) is their
    // own data, so unlike the parties below it IS decrypted for the export.
    let identity: unknown = null;
    if (identityRow) {
      identity = this.encryption.isConfigured()
        ? this.encryption.decryptObject(identityRow.data_encrypted)
        : { note: 'A saved identity exists but could not be decrypted (field encryption is not configured on this server).' };
    }

    return {
      exportedAt: new Date().toISOString(),
      notes:
        'This file contains the structured data this account holds about you. File attachments ' +
        '(car photos, document scans, uploaded files, blog images, contract PDFs) are listed here ' +
        'by name/key only, not as binary content — download them from inside the app if you need ' +
        'a copy before deleting your account.',
      profile,
      settings,
      cars,
      carNicknames,
      carMaintenanceSettings,
      maintenanceProfiles,
      sharedCarAccess: { asGrantee: sharedAsGrantee, asInviter: sharedAsInviter },
      organizationMemberships,
      driverAssignments,
      blogEntries,
      suppliers,
      uploadedFiles,
      // Never decrypted: the other party to a sale is a third party who never
      // agreed to have their data sitting in someone else's export file.
      saleContracts: saleContracts.map((contract: any) => ({
        ...contract,
        parties: contract.parties.map((party: any) => ({
          id: party.id,
          side: party.side,
          is_company: party.is_company,
          hasStoredData: party.data_encrypted != null,
        })),
      })),
      identity,
      notifications,
      pushTokens: pushTokens.map((t: any) => ({ ...t, token: maskToken(t.token) })),
      businessAccessRequests,
      activityDays,
      featureInterests,
      legalConsents,
    };
  }

  /**
   * Permanently deletes the user's own personal data and anonymizes the User row
   * in place (rather than deleting it) so organization-owned records that still
   * reference it (driver assignments, fleet cars/documents they created, who
   * decided a business-access request, ...) keep referential integrity. See the
   * class doc and ACCOUNT-CONTEXT.md for the personal/business split.
   */
  async deleteMyAccount(userId: number, confirmation: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    if (!confirmation || confirmation.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      throw new BadRequestException({
        code: 'ACCOUNT_DELETE_CONFIRMATION_MISMATCH',
        message: 'Confirmation text must match your account email exactly.',
      });
    }

    if (user.is_company_managed) {
      throw new ForbiddenException({
        code: 'ACCOUNT_COMPANY_MANAGED',
        message: 'This account is managed by an organization — ask its admin to remove it.',
      });
    }

    const ownedMemberships = await this.prisma.organizationMembership.findMany({
      where: {
        user_id: userId,
        accepted_at: { not: null },
        role: { in: [OrganizationRole.OWNER, OrganizationRole.SUPER_ADMIN] },
      },
      select: { organization: { select: { id: true, name: true } } },
    });
    if (ownedMemberships.length > 0) {
      throw new ConflictException({
        code: 'ACCOUNT_OWNS_ORGANIZATION',
        organizations: ownedMemberships.map((m) => m.organization),
        message: 'Delete or transfer ownership of your organization(s) before deleting your account.',
      });
    }

    // Collect R2 keys BEFORE the transaction — once these rows are gone, the
    // keys they pointed to are gone with them.
    const [personalCars, uploadedFiles, blogEntries, saleContracts] = await Promise.all([
      this.prisma.car.findMany({
        where: { user_id: userId, organization_id: null },
        select: { photos: { select: { url: true } }, documents: { select: { file_url: true } } },
      }),
      this.prisma.uploadedFile.findMany({ where: { user_id: userId }, select: { file_key: true } }),
      this.prisma.blogEntry.findMany({
        where: { user_id: userId },
        select: { cover_image_url: true, images: { select: { url: true } } },
      }),
      this.prisma.saleContract.findMany({ where: { user_id: userId }, select: { pdf_key: true } }),
    ]);

    const storageKeys = new Set<string>();
    for (const car of personalCars) {
      for (const photo of car.photos) if (photo.url) storageKeys.add(photo.url);
      for (const doc of car.documents) if (doc.file_url) storageKeys.add(doc.file_url);
    }
    for (const file of uploadedFiles) if (file.file_key) storageKeys.add(file.file_key);
    for (const entry of blogEntries) {
      if (entry.cover_image_url) storageKeys.add(entry.cover_image_url);
      for (const image of entry.images) if (image.url) storageKeys.add(image.url);
    }
    for (const contract of saleContracts) if (contract.pdf_key) storageKeys.add(contract.pdf_key);

    const [carsDeleted, suppliersDeleted, filesDeleted, contractsDeleted, blogDeleted] = await this.prisma.$transaction(
      async (tx) => {
        // Per-user overlay data on car records — deleted regardless of which car
        // (personal, or a fleet car they drive/were shared) it's attached to:
        // it's the user's own view-layer preference, never the organization's data.
        await tx.carMaintenanceSetting.deleteMany({ where: { user_id: userId } });
        await tx.maintenanceProfile.deleteMany({ where: { user_id: userId } });
        await tx.carUserNickname.deleteMany({ where: { user_id: userId } });
        await tx.carDeadlineOrder.deleteMany({ where: { user_id: userId } });
        // "Shared with me" access grants — personal-only feature (ACCOUNT-CONTEXT.md).
        await tx.carUserAccess.deleteMany({ where: { user_id: userId } });
        // Access rows this user created on OTHER people's cars (invited_by_user_id)
        // are intentionally left alone below — that column isn't nullable.

        // Personal cars (organization_id null) and everything that cascades from
        // them in the schema: documents, maintenance records (+parts), photos,
        // notes, wishes, and any remaining access/deadline/nickname/settings rows
        // scoped to these specific cars (incl. other users' own overlays on them).
        const cars = await tx.car.deleteMany({ where: { user_id: userId, organization_id: null } });

        const suppliersResult = await tx.supplier.deleteMany({ where: { user_id: userId, organization_id: null } });
        const filesResult = await tx.uploadedFile.deleteMany({ where: { user_id: userId } });
        const contractsResult = await tx.saleContract.deleteMany({ where: { user_id: userId } }); // parties cascade
        const blogResult = await tx.blogEntry.deleteMany({ where: { user_id: userId } }); // tags/images cascade

        await tx.userIdentity.deleteMany({ where: { user_id: userId } });
        await tx.userSettings.deleteMany({ where: { user_id: userId } });
        await tx.notification.deleteMany({ where: { user_id: userId } });
        await tx.pushToken.deleteMany({ where: { user_id: userId } });
        await tx.documentReminderSent.deleteMany({ where: { user_id: userId } });
        await tx.featureInterest.deleteMany({ where: { user_id: userId } });
        await tx.userActivityDay.deleteMany({ where: { user_id: userId } });
        // The privacy policy promises proof of acceptance (incl. IP / user agent)
        // only "for as long as the account exists".
        await tx.userLegalConsent.deleteMany({ where: { user_id: userId } });
        await tx.businessAccessRequest.deleteMany({ where: { user_id: userId } });
        // Every remaining membership here is guaranteed non-owner: an accepted
        // OWNER/SUPER_ADMIN membership in a still-existing org was rejected (409) above.
        await tx.organizationMembership.deleteMany({ where: { user_id: userId } });

        // Organization-owned records referencing this user (driver assignments,
        // fleet cars/documents they created, OrganizationMembership.invited_by_user_id,
        // BusinessAccessRequest.decided_by_user_id, UserLegalConsent's audit trail, ...)
        // are NOT touched — they belong to the organization/to compliance history and
        // keep referencing the anonymized row below.
        await tx.user.update({
          where: { id: userId },
          data: {
            email: `deleted-${userId}@deleted.invalid`,
            // google_id/first_name/last_name/picture are required (non-nullable)
            // in the current schema, so they can't literally be set to null —
            // sentinel/empty values are used instead. Reported to the orchestrator.
            google_id: `deleted-${userId}-${Date.now()}`,
            first_name: '',
            last_name: '',
            picture: '',
            refresh_token: null,
            password_hash: null,
            username: null,
            disabled_at: new Date(),
          },
        });

        return [cars.count, suppliersResult.count, filesResult.count, contractsResult.count, blogResult.count];
      },
    );

    this.logger.log(
      `Account ${userId} deleted: ${carsDeleted} car(s), ${suppliersDeleted} supplier(s), ${filesDeleted} file row(s), ` +
        `${contractsDeleted} sale contract(s), ${blogDeleted} blog entr(ies); ${storageKeys.size} storage object(s) to purge`,
    );

    // Best-effort cleanup of the R2 objects those rows pointed to. Never throws —
    // the deletion already committed; a storage hiccup here must not undo it or
    // be reported back to the user as a failure.
    await Promise.all(
      Array.from(storageKeys).map(async (key) => {
        try {
          await this.storage.deleteObject(key);
        } catch (err) {
          this.logger.error(`Account ${userId} deletion: failed to delete a storage object: ${(err as Error).message}`);
        }
      }),
    );
  }
}
