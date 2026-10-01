import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Supplier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CarAccessService } from '../car-access/car-access.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierDto } from './dto/supplier.dto';

@Injectable()
export class SupplierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carAccess: CarAccessService,
  ) {}

  async createSupplier(data: CreateSupplierDto, userId: number): Promise<SupplierDto> {
    if (data.organization_id !== undefined) {
      await this.assertOrgMember(data.organization_id, userId);
    }
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
        organization_id: data.organization_id ?? null,
      },
    });
    return this.toDto(supplier);
  }

  /** Every supplier the user can see: their own, plus any shared across an organization they're an accepted member of. */
  async getAllSuppliers(userId: number): Promise<SupplierDto[]> {
    const orgIds = await this.carAccess.getAcceptedOrganizationIds(userId);
    const suppliers = await this.prisma.supplier.findMany({
      where: {
        OR: [
          { user_id: userId },
          ...(orgIds.length ? [{ organization_id: { in: orgIds } }] : []),
        ],
      },
      orderBy: { name: 'asc' },
    });
    return suppliers.map(s => this.toDto(s));
  }

  async getSupplier(id: number, userId: number): Promise<SupplierDto> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier || !(await this.canAccess(supplier, userId))) throw new NotFoundException('Supplier not found');
    return this.toDto(supplier);
  }

  async updateSupplier(id: number, data: UpdateSupplierDto, userId: number): Promise<SupplierDto> {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing || !(await this.canAccess(existing, userId))) throw new NotFoundException('Supplier not found');
    if (data.organization_id !== undefined && data.organization_id !== existing.organization_id) {
      await this.assertOrgMember(data.organization_id, userId);
    }
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
        ...(data.organization_id !== undefined && { organization_id: data.organization_id }),
        ...(data.is_active !== undefined && { is_active: data.is_active }),
      },
    });
    return this.toDto(supplier);
  }

  async deleteSupplier(id: number, userId: number): Promise<SupplierDto> {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing || !(await this.canAccess(existing, userId))) throw new NotFoundException('Supplier not found');
    const supplier = await this.prisma.supplier.delete({ where: { id } });
    return this.toDto(supplier);
  }

  /** Used by document/maintenance-record services before linking a `supplier_id` to one of their records. */
  async assertAccessible(supplierId: number, userId: number): Promise<void> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || !(await this.canAccess(supplier, userId))) throw new NotFoundException('Supplier not found');
  }

  private async canAccess(supplier: Supplier, userId: number): Promise<boolean> {
    if (supplier.user_id === userId) return true;
    if (supplier.organization_id === null) return false;
    const orgIds = await this.carAccess.getAcceptedOrganizationIds(userId);
    return orgIds.includes(supplier.organization_id);
  }

  private async assertOrgMember(organizationId: number, userId: number): Promise<void> {
    const orgIds = await this.carAccess.getAcceptedOrganizationIds(userId);
    if (!orgIds.includes(organizationId)) {
      throw new ForbiddenException('You are not an accepted member of this organization');
    }
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
