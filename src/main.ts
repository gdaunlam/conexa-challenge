import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ValidationError } from 'class-validator';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { bootstrapCors } from './config/cors.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Pipeline de validacion global: descarta campos no declarados en los DTOs
  // y produce el shape de detalles que espera el HttpExceptionFilter.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          error: 'Bad Request',
          message: 'Validation failed',
          details: errors.flatMap((error) =>
            Object.entries(error.constraints ?? {}).map(([constraintKey, message]) => ({
              field: error.property,
              constraints: { [constraintKey]: message },
            })),
          ),
        }),
    }),
  );

  // Filtro global que normaliza el shape de errores HTTP a la convencion del proyecto.
  app.useGlobalFilters(new HttpExceptionFilter());

  // Configuracion de CORS delegada a una funcion testeable de forma aislada
  // (ver `src/config/cors.config.ts` y su spec). Acá solo la invocamos.
  bootstrapCors(app, configService);

  // Cierre limpio ante SIGTERM/SIGINT (importante para plataformas con healthcheck).
  app.enableShutdownHooks();

  // Leemos PORT desde ConfigService (no desde process.env directo) para
  // evitar drift: la configuracion que valida `validateEnv` es la misma que
  // la que decide el puerto.
  const port = configService.get<number>('port') ?? 3000;
  await app.listen(port);
  Logger.log(`Application listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
