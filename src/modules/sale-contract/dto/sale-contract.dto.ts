import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SaleContractRole, SaleContractStatus } from '@prisma/client';
import { ContractPartyDto } from './party.dto';
import { ContractVehicleDto } from './vehicle.dto';

/**
 * List view of a contract. Deliberately carries **no** personal data — not even
 * a masked name — so that listing contracts never decrypts anything and a leak
 * of this response reveals nothing about the other party.
 */
export class SaleContractSummaryDto {
    @ApiProperty({ example: 1 })
    id: number;

    @ApiProperty({ enum: SaleContractRole })
    role: SaleContractRole;

    @ApiPropertyOptional({ nullable: true, example: 12 })
    car_id: number | null;

    @ApiPropertyOptional({ nullable: true, example: 'BMW' })
    vehicle_make: string | null;

    @ApiPropertyOptional({ nullable: true, example: 'CJ 12 ABC' })
    license_plate: string | null;

    @ApiPropertyOptional({ nullable: true, example: 2750 })
    price_lei: number | null;

    @ApiPropertyOptional({ nullable: true })
    signing_date: Date | null;

    @ApiProperty({ enum: SaleContractStatus })
    status: SaleContractStatus;

    @ApiPropertyOptional({ nullable: true })
    pdf_generated_at: Date | null;

    @ApiProperty({ description: 'When the personal data on this contract is due to be erased.' })
    retention_until: Date;

    @ApiProperty({ description: 'False once the retention job has erased the parties\' details.' })
    has_personal_data: boolean;

    @ApiProperty()
    created_at: Date;
}

/** Full contract, with the parties decrypted. Only ever returned to its owner. */
export class SaleContractDto extends SaleContractSummaryDto {
    @ApiPropertyOptional({ type: ContractPartyDto, nullable: true })
    seller: ContractPartyDto | null;

    @ApiPropertyOptional({ type: ContractPartyDto, nullable: true })
    buyer: ContractPartyDto | null;

    @ApiProperty({ type: ContractVehicleDto })
    vehicle: ContractVehicleDto;

    @ApiPropertyOptional({ nullable: true, description: 'Generated from the figure, not typed by the user.' })
    price_in_words: string | null;

    @ApiPropertyOptional({ nullable: true })
    signing_place: string | null;

    @ApiProperty({ description: '"Anexe la contract: Da / Nu"' })
    has_annexes: boolean;

    @ApiPropertyOptional({ nullable: true, description: 'What the user confirmed before the PDF was generated.' })
    confirmations: Record<string, unknown> | null;

    @ApiPropertyOptional({ nullable: true })
    consent_accepted_at: Date | null;
}

export class SaleContractFileLinkDto {
    @ApiProperty({ description: 'Short-lived signed URL that downloads the generated contract.' })
    url: string;

    @ApiProperty({ example: 'Contract instrainare-dobandire CJ 12 ABC.pdf' })
    file_name: string;

    @ApiProperty({ example: 3600, description: 'Seconds until the returned URL stops working' })
    expires_in: number;
}
