import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as YAML from 'json-to-pretty-yaml';

export function generateSwaggerYaml(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('History Auto Utility API')
    .setDescription('API documentation for History Auto Utility')
    .setVersion('1.0')
    .addServer('http://localhost:3000', 'development')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const data = YAML.stringify(document);
  fs.writeFile('./prisma/swagger.yaml', data, (err) => {
    if (err) console.log(err);
    else {
      console.log('swagger.yaml file has been updated successfully\n');
    }
  });
}
