import { ApiProperty } from '@nestjs/swagger';

export class ImportRowResultDto {
  @ApiProperty({ description: '1-indexed row number in the uploaded file (header row excluded)' })
  row: number;
  @ApiProperty() success: boolean;
  @ApiProperty({ required: false, nullable: true }) carId?: number;
  @ApiProperty({ required: false, nullable: true }) label?: string;
  @ApiProperty({ required: false, nullable: true }) error?: string;
}

export class ImportCarsResultDto {
  @ApiProperty() total: number;
  @ApiProperty() created: number;
  @ApiProperty() failed: number;
  @ApiProperty({ type: [ImportRowResultDto] }) results: ImportRowResultDto[];
}
