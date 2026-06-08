import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UserSettingsController } from './user-settings.controller';
import { UserSettingsService } from './user-settings.service';

@Module({
    imports: [PrismaModule],
    controllers: [UserSettingsController],
    providers: [UserSettingsService],
})
export class UserSettingsModule {}
