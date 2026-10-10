import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

/** Not `@IsEmail` — a company-managed login is a short `username` (or, legacy, the synthetic `username@company-code` identifier), not a real inbox. */
export class LocalLoginDto {
  /** The short globally-unique username. A value containing `@` is treated as the legacy email-form identifier. */
  @ApiProperty({ required: false, example: 'gandzde' })
  @ValidateIf(o => !o.email)
  @IsString()
  @IsNotEmpty()
  username?: string;

  /** Legacy form: the full `username@company-code` identifier. */
  @ApiProperty({ required: false, example: 'gandzde@denhau-solutions' })
  @ValidateIf(o => !o.username)
  @IsString()
  @IsNotEmpty()
  email?: string;

  /** Deprecated, still accepted for backward compatibility: with `username` it resolves `username@companyCode` and requires membership of that org. */
  @ApiProperty({ required: false, example: 'denhau-solutions' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  companyCode?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;

  /** Local login is business-only; 'personal' is rejected with 403 LOCAL_LOGIN_BUSINESS_ONLY. Defaults to 'business'. */
  @ApiProperty({ required: false, enum: ['business', 'personal'], default: 'business' })
  @IsOptional()
  @IsIn(['business', 'personal'])
  context?: 'business' | 'personal';
}
