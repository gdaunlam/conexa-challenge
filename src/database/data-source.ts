import 'reflect-metadata';
import { DataSource } from 'typeorm';
import configuration from '../config/configuration';
import { assertProductionHardeningSync } from '../config/env.validation';

// Timeouts replicados desde `buildTypeOrmOptions` (ver `database.module.ts`).
// La CLI de TypeORM no pasa por ConfigModule, asi que tenemos que aplicar
// los mismos caps aca para que `pnpm migration:run` no se cuelgue contra
// una DB que no responde.
const DATA_SOURCE_CONNECT_TIMEOUT_MS = 5000;
const DATA_SOURCE_STATEMENT_TIMEOUT_MS = 5000;
const DATA_SOURCE_QUERY_TIMEOUT_MS = 5000;

// DataSource usado por la CLI de TypeORM para generar y correr migraciones
// (comandos `pnpm migration:generate`, `pnpm migration:run`, `pnpm migration:revert`).
// La aplicacion en runtime NO usa este archivo: usa `DatabaseModule` con `ConfigService`.
// La configuracion se obtiene del factory `configuration()` para no duplicar
// defaults ni leer `process.env` directamente. Si falta una credencial obligatoria
// (JWT_SECRET, DATABASE_PASSWORD), `configuration()` lanza antes de llegar aca.
const config = configuration();

// La CLI de TypeORM NO pasa por ConfigModule, asi que `validateEnv` (que valida
// con class-validator + reglas de hardening) no corre. Llamamos a la variante
// sincronica que solo aplica las reglas cross-field de produccion para que un
// `pnpm migration:run` con NODE_ENV=production y secretos triviales falle loud
// en vez de conectar con una DB con password debil.
assertProductionHardeningSync(process.env);

// MIGRATIONS EN PRODUCCION: estrategia `migrationsRun: false` por diseño.
// Antes de levantar una nueva version de la app, el script de deploy debe
// correr `pnpm migration:run` (este archivo + el comando). Justificacion y
// alternativa (lock distribuido) en `DOCS/TODO.md`, seccion `Migrations en
// produccion`. Razon corta: single instance (no multi-replica), TypeORM no
// provee lock distribuido built-in, y discipline operacional es suficiente
// mientras el deploy objetivo siga siendo server unico.
const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.database,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  migrationsRun: false,
  connectTimeoutMS: DATA_SOURCE_CONNECT_TIMEOUT_MS,
  extra: {
    statement_timeout: DATA_SOURCE_STATEMENT_TIMEOUT_MS,
    query_timeout: DATA_SOURCE_QUERY_TIMEOUT_MS,
  },
});

export default AppDataSource;
