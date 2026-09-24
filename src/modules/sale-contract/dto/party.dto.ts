import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ContractAddressDto } from './address.dto';

/** "reprezentată prin ..." — only meaningful when the party is a company. */
export class ContractRepresentativeDto {
    @ApiPropertyOptional({ example: 'Ionescu Maria' })
    @IsOptional()
    @IsString()
    @MaxLength(120)
    readonly full_name?: string;

    @ApiPropertyOptional({ example: 'KX' })
    @IsOptional()
    @IsString()
    @MaxLength(4)
    readonly id_series?: string;

    @ApiPropertyOptional({ example: '123456' })
    @IsOptional()
    @IsString()
    @MaxLength(12)
    readonly id_number?: string;

    @ApiPropertyOptional({ example: 'RO12345678' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    readonly cif?: string;

    @ApiPropertyOptional({ example: '0712345678' })
    @IsOptional()
    @IsString()
    @MaxLength(40)
    readonly phone?: string;

    @ApiPropertyOptional({ example: 'maria@example.ro' })
    @IsOptional()
    @IsEmail()
    readonly email?: string;
}

/**
 * One side of the contract — section (1) "persoana care înstrăinează" or
 * section (2) "persoana care dobândeşte".
 *
 * Everything here is personal data. It is encrypted as a single blob before it
 * reaches the database and is never written to a log. The other party to the
 * sale is usually not a user of this app, which is precisely why it is handled
 * this carefully.
 */
export class ContractPartyDto {
    @ApiProperty({ description: 'A company fills the "Subscrisa" and representative blanks instead.', example: false })
    @IsBoolean()
    readonly is_company: boolean;

    @ApiPropertyOptional({ example: 'Popescu Ion' })
    @IsOptional()
    @IsString()
    @MaxLength(160)
    readonly full_name?: string;

    @ApiPropertyOptional({ type: ContractAddressDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => ContractAddressDto)
    readonly address?: ContractAddressDto;

    @ApiPropertyOptional({ description: 'B.I./C.I./C.I.P./Paşaport', example: 'KX' })
    @IsOptional()
    @IsString()
    @MaxLength(4)
    readonly id_series?: string;

    @ApiPropertyOptional({ example: '654321' })
    @IsOptional()
    @IsString()
    @MaxLength(12)
    readonly id_number?: string;

    @ApiPropertyOptional({ description: 'CNP for a person, CIF for a company — the form shares one blank.' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    readonly cnp_or_cif?: string;

    @ApiPropertyOptional({ example: '0712345678' })
    @IsOptional()
    @IsString()
    @MaxLength(40)
    readonly phone?: string;

    @ApiPropertyOptional({ example: 'ion@example.ro' })
    @IsOptional()
    @IsEmail()
    readonly email?: string;

    @ApiPropertyOptional({ type: ContractAddressDto, description: 'Only when it differs from the address above.' })
    @IsOptional()
    @ValidateNested()
    @Type(() => ContractAddressDto)
    readonly fiscal_address?: ContractAddressDto;

    @ApiPropertyOptional({ type: ContractRepresentativeDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => ContractRepresentativeDto)
    readonly representative?: ContractRepresentativeDto;

    @ApiPropertyOptional({ description: '"în calitate de ..."', example: 'proprietar' })
    @IsOptional()
    @IsString()
    @MaxLength(120)
    readonly capacity?: string;
}
