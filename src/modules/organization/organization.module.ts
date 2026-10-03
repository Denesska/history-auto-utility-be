import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { OrganizationGuard } from '../../common/guards/organization/organization.guard';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CarModule } from '../car/car.module';

@Module({
  imports: [PrismaModule, MailModule, NotificationsModule, CarModule],
  controllers: [OrganizationController],
  providers: [OrganizationService, OrganizationGuard],
  exports: [OrganizationService, OrganizationGuard],
})
export class OrganizationModule {}
