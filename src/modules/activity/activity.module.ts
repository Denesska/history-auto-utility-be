import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../../prisma/prisma.module';
import { ActivityService } from './activity.service';
import { ActivityInterceptor } from './activity.interceptor';

@Module({
  imports: [PrismaModule],
  providers: [ActivityService, { provide: APP_INTERCEPTOR, useClass: ActivityInterceptor }],
  exports: [ActivityService],
})
export class ActivityModule {}
