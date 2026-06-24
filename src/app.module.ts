import { Logger, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CarModule } from './modules/car/car.module';
import { CarAccessModule } from './modules/car-access/car-access.module';
import { PrismaModule } from './prisma/prisma.module';
import { MaintenanceRecordModule } from './modules/maintenance-record/maintenance-record.module';
import { DocumentModule } from './modules/document/document.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { VehicleCatalogModule } from './modules/vehicle-catalog/vehicle-catalog.module';
import { BlogModule } from './modules/blog/blog.module';
import { AppVersionModule } from './modules/app-version/app-version.module';
import { UploadModule } from './modules/upload/upload.module';
import { UserSettingsModule } from './modules/user-settings/user-settings.module';
import { BootstrapModule } from './modules/bootstrap/bootstrap.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DocumentRemindersModule } from './modules/document-reminders/document-reminders.module';

@Module({
  imports: [
    // CarAccessModule must be before CarModule so GET /car/shared resolves before GET /car/:id
    CarAccessModule,
    CarModule,
    VehicleCatalogModule,
    PrismaModule,
    MaintenanceRecordModule,
    DocumentModule,
    BlogModule,
    AppVersionModule,
    UploadModule,
    UserSettingsModule,
    BootstrapModule,
    NotificationsModule,
    DocumentRemindersModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.ENV_FILE ?? '.env',
    }),
    AuthModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [],
  providers: [Logger],
  exports: [Logger],
})
export class AppModule {}
