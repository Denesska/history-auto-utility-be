import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { SaleContractRole } from '@prisma/client';
import { ContractPartyDto } from './party.dto';
import { ContractVehicleDto } from './vehicle.dto';

export class CreateSaleContractDto {
    @ApiProperty({ enum: SaleContractRole, description: 'Which side of the sale the app user is on.' })
    @IsEnum(SaleContractRole)
    readonly role: SaleContractRole;

    @ApiPropertyOptional({
        description:
            'Null when the vehicle is not in the garage — the normal case when the user is the buyer. ' +
            'The vehicle details are snapshotted either way, so later edits to the car never rewrite a signed contract.',
        example: 12,
    })
    @IsOptional()
    @IsInt()
    readonly car_id?: number;

    @ApiProperty({ type: ContractPartyDto })
    @ValidateNested()
    @Type(() => ContractPartyDto)
    readonly seller: ContractPartyDto;

    @ApiProperty({ type: ContractPartyDto })
    @ValidateNested()
    @Type(() => ContractPartyDto)
    readonly buyer: ContractPartyDto;

    @ApiProperty({ type: ContractVehicleDto })
    @ValidateNested()
    @Type(() => ContractVehicleDto)
    readonly vehicle: ContractVehicleDto;

    @ApiPropertyOptional({ description: 'Price in lei. The words version is generated from it.', example: 2750 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    readonly price_lei?: number;

    @ApiPropertyOptional({ example: '2026-09-22' })
    @IsOptional()
    @IsDateString()
    readonly signing_date?: string;

    @ApiPropertyOptional({ example: 'Cluj-Napoca' })
    @IsOptional()
    @IsString()
    @MaxLength(120)
    readonly signing_place?: string;

    @ApiPropertyOptional({ description: '"Anexe la contract: Da / Nu"', default: false })
    @IsOptional()
    @IsBoolean()
    readonly has_annexes?: boolean;

    @ApiPropertyOptional({
        description:
            'Version of the consent text the user accepted before the other party\'s identity document was processed. ' +
            'Required as soon as any identity data for the other party is supplied.',
        example: '2026-09-v1',
    })
    @IsOptional()
    @IsString()
    @MaxLength(40)
    readonly consent_version?: string;

    @ApiPropertyOptional({
        description:
            'Keep the contract in the car history instead of letting the retention job purge it. ' +
            'Opt-in: left off, personal data is erased automatically.',
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    readonly keep_in_history?: boolean;
}
