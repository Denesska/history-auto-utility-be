import {NestFactory, Reflector} from '@nestjs/core';
import { AppModule } from './app.module';
import {ValidationPipe} from "./common/pipes/validation/validation.pipe";
import {LoggingInterceptor} from "./common/interceptors/logging.interceptor";
import {RolesGuard} from "./common/guards/roles/roles.guard";
import {HttpExceptionFilter} from "./common/filters/http-exception.filter";
import {generateSwaggerYaml} from "./utils/swagger.util";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  generateSwaggerYaml(app);
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new RolesGuard(reflector));
  await app.listen(3000);
}
bootstrap();
