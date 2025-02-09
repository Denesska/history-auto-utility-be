import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RolesGuard } from './common/guards/roles/roles.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { generateSwaggerYaml } from './utils/swagger.util';
import * as dotenv from 'dotenv';
import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import { Logger } from '@nestjs/common';
import { join } from 'path';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({
    origin: 'http://localhost:4200', // Permite frontend-ului accesul
    credentials: true, // Permite trimiterea cookie-urilor în cereri
  });
  generateSwaggerYaml(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new RolesGuard(reflector));
  app.setGlobalPrefix('api');
  app.useLogger(app.get(Logger));
  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));
  await app.listen(3000);
}

void bootstrap();
