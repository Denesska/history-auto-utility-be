import { ApiProperty } from '@nestjs/swagger';

/** 0 = all time. */
export const FLEET_COST_RANGES = [90, 180, 365, 0] as const;
export type FleetCostRange = (typeof FLEET_COST_RANGES)[number];

export class FleetCostByMonthDto {
  @ApiProperty({ example: '2026-09' })
  month: string;

  @ApiProperty({ example: 1240.5 })
  total: number;

  @ApiProperty({ example: 820 })
  companyExpense: number;
}

export class FleetCostByCarDto {
  @ApiProperty({ example: 149 })
  carId: number;

  @ApiProperty({ example: 'Dacia Logan MCV' })
  label: string;

  @ApiProperty({ example: 'BV 22 DHS', nullable: true })
  licensePlate: string | null;

  @ApiProperty({ example: 2150.75 })
  total: number;

  @ApiProperty({ example: 1500 })
  companyExpense: number;

  @ApiProperty({ example: 6 })
  recordCount: number;
}

export class FleetCostDashboardDto {
  @ApiProperty({ example: 90 })
  range: FleetCostRange;

  @ApiProperty({ example: 4820.25 })
  totalCost: number;

  @ApiProperty({ example: 3100 })
  companyExpenseCost: number;

  @ApiProperty({ example: 14 })
  recordCount: number;

  @ApiProperty({ example: 2 })
  carCount: number;

  @ApiProperty({ type: [FleetCostByMonthDto] })
  byMonth: FleetCostByMonthDto[];

  @ApiProperty({ type: [FleetCostByCarDto], description: 'Sorted by total cost, highest first.' })
  byCar: FleetCostByCarDto[];
}
