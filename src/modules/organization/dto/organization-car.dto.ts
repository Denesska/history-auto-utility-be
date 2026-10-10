import { ApiProperty } from '@nestjs/swagger';

/** The car's current driver, as surfaced on the Organization fleet list — just enough to show who it is and render an avatar; see `DriverAssignmentDto.driver` (`driver-assignment` module) for the full shape used on the car's own "Șofer" screen. */
export class OrganizationCarDriverDto {
  @ApiProperty() id: number;
  @ApiProperty() first_name: string;
  @ApiProperty() last_name: string;
  @ApiProperty({ nullable: true }) picture: string | null;
}

/**
 * A car as listed on the Organization screen's "company cars" section — just
 * enough to identify it and manage membership in the fleet. Deliberately no
 * `nickname` field: a car's nickname is private to whoever set it (see
 * CarUserNickname) and an admin viewing the whole fleet has no business
 * seeing any individual's private label — this list always shows make+model.
 */
export class OrganizationCarDto {
  @ApiProperty() id: number;
  @ApiProperty() make: string;
  @ApiProperty() model: string;
  @ApiProperty({ nullable: true }) photoUrl: string | null;
  @ApiProperty({ nullable: true }) license_plate: string | null;
  @ApiProperty({ nullable: true }) vin: string | null;
  @ApiProperty({ nullable: true }) year: number | null;
  /** The car's current driver (active `CarDriverAssignment`, `ended_at: null`), or `null` if the car has no driver assigned right now. */
  @ApiProperty({ type: OrganizationCarDriverDto, nullable: true }) currentDriver: OrganizationCarDriverDto | null;
}
