import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentRemindersService } from './document-reminders.service';

@Module({
  imports: [PrismaModule, MailModule, NotificationsModule],
  providers: [DocumentRemindersService],
})
export class DocumentRemindersModule {}
