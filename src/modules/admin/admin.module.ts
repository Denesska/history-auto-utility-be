import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAiUsageService } from './admin-ai-usage.service';
import { DocumentRemindersModule } from '../document-reminders/document-reminders.module';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [PrismaModule, DocumentRemindersModule],
  controllers: [AdminController],
  providers: [AdminService, AdminAiUsageService, AdminGuard],
})
export class AdminModule {}
