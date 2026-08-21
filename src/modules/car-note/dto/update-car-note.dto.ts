import { PartialType } from '@nestjs/mapped-types';
import { CreateCarNoteDto } from './create-car-note.dto';

export class UpdateCarNoteDto extends PartialType(CreateCarNoteDto) {}
