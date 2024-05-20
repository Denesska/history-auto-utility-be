import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {ConfigModule, ConfigService} from "@nestjs/config";

@Module({
    imports: [ConfigModule],
    providers: [PrismaService, {
        provide: 'DATABASE_URL',
        useFactory: (configService: ConfigService) => configService.get<string>('DATABASE_URL'),
        inject: [ConfigService],
    }],
    exports: [PrismaService],
})
export class PrismaModule {}
