import { Module } from '@nestjs/common';
import { CarAccessController } from './car-access.controller';
import { CarAccessService } from './car-access.service';
import { CarAccessGuard } from '../../common/guards/car-access/car-access.guard';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, MailModule, NotificationsModule],
  controllers: [CarAccessController],
  providers: [CarAccessService, CarAccessGuard],
  exports: [CarAccessService, CarAccessGuard],
})
export class CarAccessModule {}
