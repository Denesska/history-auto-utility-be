import { IsString, IsOptional, IsEnum, IsInt, IsEmail, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierType } from '@prisma/client';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Service Auto Plus' })
  @IsString()
  @MinLength(1)
  readonly name: string;

  @ApiPropertyOptional({ enum: SupplierType, example: SupplierType.SERVICE })
  @IsOptional()
  @IsEnum(SupplierType)
  readonly type?: SupplierType;

  @ApiPropertyOptional({ example: 'Ion Popescu' })
  @IsOptional()
  @IsString()
  readonly contact_name?: string;

  @ApiPropertyOptional({ example: '+40 721 234 567' })
  @IsOptional()
  @IsString()
  readonly phone?: string;

  @ApiPropertyOptional({ example: 'contact@serviceauto.ro' })
  @IsOptional()
  @IsEmail()
  readonly email?: string;

  @ApiPropertyOptional({ example: 'Str. Mecanicilor nr. 10, București' })
  @IsOptional()
  @IsString()
  readonly address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly notes?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Share this supplier with a fleet organization instead of keeping it personal. Must be an organization the caller is an accepted member of.',
  })
  @IsOptional()
  @IsInt()
  readonly organization_id?: number;
}
