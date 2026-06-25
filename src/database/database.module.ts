import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';

const MIGRATIONS_GLOB = __dirname + '/migrations/*{.ts,.js}';

const TYPEORM_CONNECT_TIMEOUT_MS = 5000;

const TYPEORM_STATEMENT_TIMEOUT_MS = 5000;
const TYPEORM_QUERY_TIMEOUT_MS = 5000;

export const buildTypeOrmOptions = (configService: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.getOrThrow<string>('database.host'),
  port: configService.getOrThrow<number>('database.port'),
  username: configService.getOrThrow<string>('database.username'),
  password: configService.getOrThrow<string>('database.password'),
  database: configService.getOrThrow<string>('database.database'),
  autoLoadEntities: true,
  synchronize: false,

  migrations: [MIGRATIONS_GLOB],
  migrationsRun: false,

  connectTimeoutMS: TYPEORM_CONNECT_TIMEOUT_MS,
  extra: {
    statement_timeout: TYPEORM_STATEMENT_TIMEOUT_MS,
    query_timeout: TYPEORM_QUERY_TIMEOUT_MS,
  },
});

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
  ],
})
export class DatabaseModule {}
