import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UsernameSuggestionQueryDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80) firstName: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80) lastName: string;
}

export class UsernameAvailableQueryDto {
  @ApiProperty() @IsString() @MaxLength(40) username: string;
}

export class UsernameSuggestionDto {
  @ApiProperty() username: string;
}

export class UsernameAvailableDto {
  @ApiProperty() available: boolean;
}
