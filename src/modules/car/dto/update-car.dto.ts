import { PartialType } from '@nestjs/mapped-types';
import { AddCarDto } from './add-car.dto';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCarDto extends PartialType(AddCarDto) {

}
