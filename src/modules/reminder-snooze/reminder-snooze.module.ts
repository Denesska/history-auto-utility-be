import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CarAccessModule } from '../car-access/car-access.module';
import { ReminderSnoozeController } from './reminder-snooze.controller';
import { ReminderSnoozeService } from './reminder-snooze.service';

@Module({
  imports: [PrismaModule, AuthModule, CarAccessModule],
  controllers: [ReminderSnoozeController],
  providers: [ReminderSnoozeService],
  exports: [ReminderSnoozeService],
})
export class ReminderSnoozeModule {}
