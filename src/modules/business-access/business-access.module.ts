import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminGuard } from '../admin/admin.guard';
import { BusinessAccessController } from './business-access.controller';
import { AdminBusinessAccessController } from './admin-business-access.controller';
import { BusinessAccessService } from './business-access.service';

@Module({
  imports: [PrismaModule, MailModule, NotificationsModule],
  controllers: [BusinessAccessController, AdminBusinessAccessController],
  providers: [BusinessAccessService, AdminGuard],
  exports: [BusinessAccessService],
})
export class BusinessAccessModule {}
