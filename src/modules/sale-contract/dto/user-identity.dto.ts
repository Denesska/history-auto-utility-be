import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { ContractPartyDto } from './party.dto';

/**
 * The app user's own details, saved once so they don't rescan their ID for every
 * contract. Stored with the same encryption as a contract party — it is the same
 * class of data, and the fact that it belongs to our own user changes nothing.
 */
export class SaveUserIdentityDto {
    @ApiProperty({ type: ContractPartyDto })
    @ValidateNested()
    @Type(() => ContractPartyDto)
    readonly identity: ContractPartyDto;
}

export class UserIdentityDto {
    @ApiPropertyOptional({ type: ContractPartyDto, nullable: true })
    identity: ContractPartyDto | null;

    @ApiPropertyOptional({ nullable: true })
    updated_at: Date | null;
}
