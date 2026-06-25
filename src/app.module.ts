import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './domain/auth/auth.module';
import { JwtAuthGuard } from './domain/auth/guards/jwt-auth.guard';
import { RolesGuard } from './domain/auth/guards/roles.guard';
import { HealthModule } from './domain/health/health.module';
import { MoviesModule } from './domain/movies/movies.module';
import { SyncModule } from './domain/sync/sync.module';
import { TraceIdMiddleware } from './common/middleware/trace-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      cache: true,
    }),
    DatabaseModule,
    AuthModule,
    MoviesModule,
    SyncModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceIdMiddleware).forRoutes('*');
  }
}
