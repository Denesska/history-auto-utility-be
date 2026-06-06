import { Logger, Module } from '@nestjs/common';
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
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.ENV_FILE ?? '.env',
    }),
    AuthModule,
  ],
  controllers: [],
  providers: [Logger],
  exports: [Logger],
})
export class AppModule {}
