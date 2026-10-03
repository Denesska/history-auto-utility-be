import { ForbiddenException, Injectable } from '@nestjs/common';
import { OrganizationRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FleetCostByCarDto, FleetCostByMonthDto, FleetCostDashboardDto, FleetCostRange } from './dto/fleet-cost.dto';

@Injectable()
export class FleetCostService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(organizationId: number, userId: number, range: FleetCostRange): Promise<FleetCostDashboardDto> {
    await this.assertCanView(organizationId, userId);

    const since: Prisma.Sql = range === 0 ? Prisma.sql`TRUE` : Prisma.sql`m.service_date >= CURRENT_DATE - ${range}::int * INTERVAL '1 day'`;

    const [[totals], byMonth, byCar] = await Promise.all([
      this.prisma.$queryRaw<{ totalCost: number; companyExpenseCost: number; recordCount: number; carCount: number }[]>`
        SELECT
          COALESCE(SUM(m.cost), 0)::float8 AS "totalCost",
          COALESCE(SUM(m.cost) FILTER (WHERE m.is_company_expense), 0)::float8 AS "companyExpenseCost",
          COUNT(*)::int AS "recordCount",
          COUNT(DISTINCT m.car_id)::int AS "carCount"
        FROM "MaintenanceRecord" m
        JOIN "Car" c ON c.id = m.car_id
        WHERE c.organization_id = ${organizationId} AND ${since}`,
      this.prisma.$queryRaw<FleetCostByMonthDto[]>`
        SELECT
          to_char(m.service_date, 'YYYY-MM') AS month,
          SUM(m.cost)::float8 AS total,
          COALESCE(SUM(m.cost) FILTER (WHERE m.is_company_expense), 0)::float8 AS "companyExpense"
        FROM "MaintenanceRecord" m
        JOIN "Car" c ON c.id = m.car_id
        WHERE c.organization_id = ${organizationId} AND ${since}
        GROUP BY 1 ORDER BY 1`,
      // No per-viewer nickname here on purpose — this is a Director/admin fleet
      // report shown across the whole org, and a car's private nickname (see
      // CarUserNickname) is never shown to anyone but the person who set it.
      // Always make+model, same as the Organization screen's "company cars" list.
      this.prisma.$queryRaw<FleetCostByCarDto[]>`
        SELECT
          c.id AS "carId",
          trim(c.make || ' ' || c.model) AS label,
          c.license_plate AS "licensePlate",
          SUM(m.cost)::float8 AS total,
          COALESCE(SUM(m.cost) FILTER (WHERE m.is_company_expense), 0)::float8 AS "companyExpense",
          COUNT(*)::int AS "recordCount"
        FROM "MaintenanceRecord" m
        JOIN "Car" c ON c.id = m.car_id
        WHERE c.organization_id = ${organizationId} AND ${since}
        GROUP BY c.id, c.make, c.model, c.license_plate
        ORDER BY total DESC`,
    ]);

    return {
      range,
      totalCost: totals?.totalCost ?? 0,
      companyExpenseCost: totals?.companyExpenseCost ?? 0,
      recordCount: totals?.recordCount ?? 0,
      carCount: totals?.carCount ?? 0,
      byMonth,
      byCar,
    };
  }

  /**
   * Any accepted member can view, except a DRIVER — they're scoped to only
   * their assigned car(s) elsewhere in the app (see `CarAccessService`), so
   * seeing fleet-wide costs across cars they otherwise can't open would be a
   * bigger window than the rest of their role gives them.
   */
  private async assertCanView(organizationId: number, userId: number): Promise<void> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
    });
    if (membership?.role === OrganizationRole.DRIVER) {
      throw new ForbiddenException('Drivers cannot view the fleet cost dashboard');
    }
  }
}
