import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NodeEnv } from './env.validation';

export function setupSwagger(app: INestApplication, configService: ConfigService): void {
  const logger = new Logger('Swagger');
  const nodeEnv = configService.get<NodeEnv>('nodeEnv') ?? NodeEnv.Development;

  if (nodeEnv === NodeEnv.Production) {
    logger.warn('Swagger UI disabled in production (NODE_ENV=production)');
    return;
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Movies API')
    .setDescription('Backend para gestion de peliculas sincronizadas con SWAPI')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
  logger.log('Swagger UI available at /api/docs');
}
