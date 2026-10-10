import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CarAccessModule } from '../car-access/car-access.module';
import { UserSettingsController } from './user-settings.controller';
import { UserSettingsService } from './user-settings.service';

@Module({
    imports: [PrismaModule, CarAccessModule],
    controllers: [UserSettingsController],
    providers: [UserSettingsService],
    exports: [UserSettingsService],
})
export class UserSettingsModule {}
