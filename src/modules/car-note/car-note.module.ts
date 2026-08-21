import { Module } from '@nestjs/common';
import { CarNoteController } from './car-note.controller';
import { CarNoteService } from './car-note.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [CarNoteController],
    providers: [CarNoteService],
    exports: [CarNoteService],
})
export class CarNoteModule {}
