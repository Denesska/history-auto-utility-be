import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Section (3), "obiectul contractului". Not personal data. */
export class ContractVehicleDto {
    @ApiPropertyOptional({ example: 'BMW' })
    @IsOptional()
    @IsString()
    @MaxLength(60)
    readonly make?: string;

    @ApiPropertyOptional({ description: '"tipul", as printed on the registration certificate', example: '3 (E46)' })
    @IsOptional()
    @IsString()
    @MaxLength(60)
    readonly type?: string;

    @ApiPropertyOptional({ description: '"număr de identificare" — the VIN', example: 'WBAAL71060JR12345' })
    @IsOptional()
    @IsString()
    @MaxLength(24)
    readonly vin?: string;

    @ApiPropertyOptional({ example: '306D2-12345678' })
    @IsOptional()
    @IsString()
    @MaxLength(40)
    readonly engine_series?: string;

    @ApiPropertyOptional({ example: 1995 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100000)
    readonly engine_capacity_cm3?: number;

    @ApiPropertyOptional({ description: 'Trailers and semi-trailers only.', example: 1.5 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    readonly max_weight_tons?: number;

    @ApiPropertyOptional({ example: 'CJ 12 ABC' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    readonly license_plate?: string;

    @ApiPropertyOptional({ example: '2027-04-18' })
    @IsOptional()
    @IsDateString()
    readonly itp_expiry_date?: string;

    @ApiPropertyOptional({ description: '"numărul cărţii de identitate a vehiculului" (CIV)', example: 'K123456' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    readonly civ_number?: string;

    @ApiPropertyOptional({ example: 2004 })
    @IsOptional()
    @IsInt()
    @Min(1900)
    @Max(2200)
    readonly manufacture_year?: number;

    @ApiPropertyOptional({ example: 'Euro 4' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    readonly euro_norm?: string;

    @ApiPropertyOptional({ description: 'When the seller acquired it.', example: '2019-08-01' })
    @IsOptional()
    @IsDateString()
    readonly acquired_date?: string;

    @ApiPropertyOptional({ description: '"conform act ..."', example: 'contract de vânzare-cumpărare' })
    @IsOptional()
    @IsString()
    @MaxLength(160)
    readonly acquired_document?: string;
}
