import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * The in-app checkpoint that has to be cleared before a PDF is produced.
 *
 * None of these tick boxes appear on the PDF, and they must not: ITL 054 is a
 * standardised fiscal form and a modified one can be refused at the counter.
 * The declarations the parties make are already printed at section (5) of the
 * form — that the vehicle is the seller's property and free of encumbrances,
 * that the keys, registration certificate and CIV changed hands, that the price
 * was paid, and that both parties know the Criminal Code provisions on forgery.
 *
 * What these flags record is that the user was *shown* those declarations and
 * confirmed the data behind them. That is evidence protecting us as the tool's
 * provider; it is not, and cannot be, a substitute for the parties' signatures.
 *
 * Every flag must be literally `true` — `@Equals(true)` rather than `@IsBoolean()`,
 * so that an omitted or false confirmation is a validation error rather than a
 * silently generated contract.
 */
export class SaleContractConfirmationsDto {
    @ApiProperty({ description: 'The user checked the data read from the documents and confirms it is correct.' })
    @Equals(true)
    readonly data_verified: boolean;

    @ApiProperty({ description: 'The declarations printed at section (5) of the form were read and accepted.' })
    @Equals(true)
    readonly declarations_accepted: boolean;

    @ApiProperty({ description: 'Acknowledges the Criminal Code provisions on forgery quoted by the form.' })
    @Equals(true)
    readonly criminal_code_acknowledged: boolean;

    @ApiProperty({ description: 'Acknowledges that the app generates a form and does not give legal advice.' })
    @Equals(true)
    readonly disclaimer_acknowledged: boolean;
}

export class GenerateSaleContractDto {
    @ApiProperty({ type: SaleContractConfirmationsDto })
    @ValidateNested()
    @Type(() => SaleContractConfirmationsDto)
    readonly confirmations: SaleContractConfirmationsDto;

    @ApiPropertyOptional({
        description:
            'How many pages the PDF should contain. One by default — the contract is filed in several ' +
            'exemplars, but the user multiplies it at the printer. Ask for more only when the Original/Copie ' +
            'ticks need to differ per page: page 1 is ticked Original, pages 2 onwards Copie.',
        default: 1,
        example: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(8)
    readonly copies?: number;

    @ApiPropertyOptional({
        description: 'Keep the contract and its personal data past the default retention window.',
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    readonly keep_in_history?: boolean;
}
