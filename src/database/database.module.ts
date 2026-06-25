import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';

const MIGRATIONS_GLOB = __dirname + '/migrations/*{.ts,.js}';

// Handshake inicial contra Postgres. Si el host no responde (firewall, DNS,
// etc.) `pg` espera por default indefinidamente; con este cap el `forRoot`
// falla rapido y el orquestador puede reiniciar.
const TYPEORM_CONNECT_TIMEOUT_MS = 5000;

// Tope para queries en runtime. `statement_timeout` lo enforza Postgres del
// lado servidor; `query_timeout` lo enforza el driver del lado cliente. Con
// ambos cubrimos tanto Postgres cooperativo (lo mata) como Postgres colgado
// (lo mata el driver). 5s es agresivo para queries reales del pase de
// dominio; ajustar desde env si hace falta cuando aparezcan queries
// costosas (sync SWAPI, paginacion grande).
const TYPEORM_STATEMENT_TIMEOUT_MS = 5000;
const TYPEORM_QUERY_TIMEOUT_MS = 5000;

// MIGRATIONS EN PRODUCCION: `migrationsRun: false` por diseño (ver
// `data-source.ts` y `DOCS/TODO.md`). Antes de levantar una nueva version
// de la app, correr `pnpm migration:run` desde CI/CD para aplicar las
// migrations pendientes. La app en runtime NO corre migrations (single
// instance scope; con N replicas se necesitaria un mecanismo de lock
// distribuido que TypeORM no provee built-in).

export const buildTypeOrmOptions = (configService: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.getOrThrow<string>('database.host'),
  port: configService.getOrThrow<number>('database.port'),
  username: configService.getOrThrow<string>('database.username'),
  password: configService.getOrThrow<string>('database.password'),
  database: configService.getOrThrow<string>('database.database'),
  autoLoadEntities: true,
  synchronize: false,
  // `migrationsRun: false`: ver comentario sobre la estrategia de migrations
  // en produccion arriba. La lista `migrations` queda igual para que la CLI
  // (`pnpm migration:run`) sepa que migrations considerar.
  migrations: [MIGRATIONS_GLOB],
  migrationsRun: false,
  // Timeouts: evitan que una query colgada bloquee `/health` (y por
  // extension el pool compartido) indefinidamente. El LB espera su propio
  // timeout antes de sacar la instancia; mientras tanto, requests de dominio
  // comparten el pool y pueden caer en cascade.
  connectTimeoutMS: TYPEORM_CONNECT_TIMEOUT_MS,
  extra: {
    statement_timeout: TYPEORM_STATEMENT_TIMEOUT_MS,
    query_timeout: TYPEORM_QUERY_TIMEOUT_MS,
  },
});

/**
 * Modulo que configura la conexion a PostgreSQL con TypeORM.
 * - `synchronize: false`: nunca sincroniza el esquema automaticamente.
 * - `migrationsRun: false`: las migrations NO corren al boot. Ver el
 *   comentario sobre la estrategia de migrations en produccion en
 *   `buildTypeOrmOptions` y `DOCS/TODO.md`. La CLI `pnpm migration:run`
 *   las aplica como step de CI/CD antes de levantar la nueva version.
 * - `autoLoadEntities: true`: detecta las entities registradas en otros
 *   modulos sin tener que listarlas manualmente aqui.
 * - `connectTimeoutMS` + `extra.statement_timeout` + `extra.query_timeout`:
 *   timeouts duros para que una DB que cuelga no tumbe la app.
 */
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
