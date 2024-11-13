import {Module} from '@nestjs/common';
import {CarModule} from './modules/car/car.module';
import {PrismaModule} from './prisma/prisma.module';
import {MaintenanceRecordModule} from './modules/maintenance-record/maintenance-record.module';
import {DocumentModule} from './modules/document/document.module';
import {ConfigModule} from "@nestjs/config";
import {AuthModule} from './modules/auth/auth.module';

@Module({
    imports: [CarModule, PrismaModule, MaintenanceRecordModule, DocumentModule, ConfigModule.forRoot({
        isGlobal: true,
    }),
        PrismaModule,
        AuthModule,],
    controllers: [],
    providers: [],
})
export class AppModule {
}
