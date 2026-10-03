import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Supplier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getRequestSessionContext } from '../../common/context/request-context';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierDto } from './dto/supplier.dto';

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Which suppliers exist for this request: the active organization's
   * suppliers (shared across its members). Suppliers are business-only — the
   * controller is `@Scope('business')`, so the personal branch below is dead
   * for HTTP callers; it is kept as a safe fallback (and legacy personal rows
   * in the DB are left untouched, just unreachable).
   */
  private contextWhere(userId: number): Prisma.SupplierWhereInput {
    const ctx = getRequestSessionContext();
    if (ctx?.type === 'business') {
      // orgId is never null here: the context interceptor rejects business routes without one.
      return { organization_id: ctx.orgId ?? -1 };
    }
    return { user_id: userId, organization_id: null };
  }

  async createSupplier(data: CreateSupplierDto, userId: number): Promise<SupplierDto> {
    // The context decides where the supplier lives; a client-sent organization_id is ignored.
    const ctx = getRequestSessionContext();
    const organizationId = ctx?.type === 'business' ? ctx.orgId : null;
    const supplier = await this.prisma.supplier.create({
      data: {
        name: data.name,
        type: data.type,
        contact_name: data.contact_name ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        notes: data.notes ?? null,
        user_id: userId,
        organization_id: organizationId,
      },
    });
    return this.toDto(supplier);
  }

  /** Every supplier of the current context (see `contextWhere`). */
  async getAllSuppliers(userId: number): Promise<SupplierDto[]> {
    const suppliers = await this.prisma.supplier.findMany({
      where: this.contextWhere(userId),
      orderBy: { name: 'asc' },
    });
    return suppliers.map(s => this.toDto(s));
  }

  async getSupplier(id: number, userId: number): Promise<SupplierDto> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier || !this.canAccess(supplier, userId)) throw new NotFoundException('Supplier not found');
    return this.toDto(supplier);
  }

  async updateSupplier(id: number, data: UpdateSupplierDto, userId: number): Promise<SupplierDto> {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing || !this.canAccess(existing, userId)) throw new NotFoundException('Supplier not found');
    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.contact_name !== undefined && { contact_name: data.contact_name }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.is_active !== undefined && { is_active: data.is_active }),
      },
    });
    return this.toDto(supplier);
  }

  async deleteSupplier(id: number, userId: number): Promise<SupplierDto> {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing || !this.canAccess(existing, userId)) throw new NotFoundException('Supplier not found');
    const supplier = await this.prisma.supplier.delete({ where: { id } });
    return this.toDto(supplier);
  }

  /**
   * What a document/maintenance-record write may store as `supplier_id`:
   * suppliers are business-only, so outside a business context the value is
   * ignored (`undefined` = leave as is / null on create); in business it is
   * validated against the active organization.
   */
  async resolveLinkedSupplierId(supplierId: number | null | undefined, userId: number): Promise<number | null | undefined> {
    if (getRequestSessionContext()?.type !== 'business') return undefined;
    if (supplierId != null) await this.assertAccessible(supplierId, userId);
    return supplierId;
  }

  /** Used by document/maintenance-record services before linking a `supplier_id` to one of their records. */
  async assertAccessible(supplierId: number, userId: number): Promise<void> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || !this.canAccess(supplier, userId)) throw new NotFoundException('Supplier not found');
  }

  /** A supplier is reachable only from the context it belongs to. Membership is already verified per request by the context interceptor. */
  private canAccess(supplier: Supplier, userId: number): boolean {
    const ctx = getRequestSessionContext();
    if (ctx?.type === 'business') return supplier.organization_id !== null && supplier.organization_id === ctx.orgId;
    return supplier.user_id === userId && supplier.organization_id === null;
  }

  private toDto(supplier: Supplier): SupplierDto {
    return {
      id: supplier.id,
      name: supplier.name,
      type: supplier.type,
      contact_name: supplier.contact_name,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      notes: supplier.notes,
      is_active: supplier.is_active,
      organization_id: supplier.organization_id,
    };
  }
}
