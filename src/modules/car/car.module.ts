import { Module } from '@nestjs/common';
import { CarController } from './car.controller';
import { CarService } from './car.service';
import {LoggingInterceptor} from "../../common/interceptors/logging.interceptor";
import {APP_GUARD, APP_INTERCEPTOR} from "@nestjs/core";
import {PrismaModule} from "../../prisma/prisma.module";
import {RolesGuard} from "../../common/guards/roles/roles.guard";

@Module({
  imports: [PrismaModule],
  controllers: [CarController],
  providers: [
    CarService,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class CarModule {}
