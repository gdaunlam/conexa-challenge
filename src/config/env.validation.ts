import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateOrReject,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const PRODUCTION_JWT_SECRET_MIN_LENGTH = 32;
const PRODUCTION_DATABASE_PASSWORD_MIN_LENGTH = 12;
const TRIVIAL_DATABASE_PASSWORD_SUBSTRINGS: readonly string[] = [
  'postgres',
  'password',
  'admin',
  'changeme',
  'secret',
];

const isTrivialDatabasePassword = (value: string): boolean => {
  const lower = value.toLowerCase();
  return TRIVIAL_DATABASE_PASSWORD_SUBSTRINGS.some((needle) => lower.includes(needle));
};

const isWildcardCORSOrigins = (value: string): boolean => {
  // Aceptamos `*` solo, ` * `, `*` mezclado con otros origins, o multiples `*`:
  // todos esos patrones son ambiguos o rotos a nivel browser. Lo rechazamos en prod
  // para evitar que el deploy arranque con un CORS que el browser ignora silenciosamente.
  return value.split(',').some((segment) => segment.trim() === '*');
};

/**
 * Esquema de las variables de entorno con decorators de class-validator.
 * - `DATABASE_PASSWORD` y `JWT_SECRET` no tienen defaults: si faltan, la app no bootea.
 * - Las reglas validan formato y rangos; las invariantes cross-field de produccion
 *   (secrets mas fuertes, CORS obligatorio) se chequean en `validateEnv`.
 */
export class EnvVars {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_HOST: string = 'localhost';

  @IsInt()
  @Min(1)
  @Max(65535)
  DATABASE_PORT: number = 5432;

  @IsString()
  @IsNotEmpty()
  DATABASE_USER: string = 'postgres';

  // Sin default: credencial obligatoria, sin fallback inseguro.
  @IsString()
  @IsNotEmpty()
  DATABASE_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_NAME: string = 'movies_db';

  // Sin default: secret obligatorio, sin fallback inseguro. La longitud minima
  // de 16 caracteres aplica a dev/test; en produccion `validateEnv` exige 32+.
  @IsString()
  @MinLength(16)
  JWT_SECRET!: string;

  @IsInt()
  @Min(60)
  JWT_TTL_SECONDS: number = 3600;

  @IsInt()
  @Min(4)
  @Max(15)
  BCRYPT_COST: number = 10;

  // CSV de origins. Opcional en dev (CORS queda como `*`); obligatorio en prod.
  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;
}

/**
 * Aplica las reglas cross-field de produccion (secret length, blacklist, CORS).
 * Recibe una instancia ya validada por class-validator. Si algun chequeo falla,
 * lanza `Error` con un mensaje que lista todos los problemas para que el operador
 * los arregle de una sola pasada.
 *
 * Esta funcion se invoca desde `validateEnv` (que corre al boot por ConfigModule)
 * y desde `assertProductionHardeningSync` (que corre desde `data-source.ts`, el
 * punto de entrada de la CLI de TypeORM, que no pasa por ConfigModule).
 */
function assertProductionHardening(env: EnvVars): void {
  const problems: string[] = [];

  // WARNING #2 (R1 W2): `JWT_SECRET` y `DATABASE_PASSWORD` son `string` (sin
  // default), pero el class-transformer con `enableImplicitConversion` los
  // convierte a `string` solo si vienen presentes. Si `rawConfig` los omite
  // y NODE_ENV=production, accediamos a `.length` sobre `undefined` y
  // tirabamos `TypeError: Cannot read properties of undefined (reading 'length')`
  // - un mensaje no accionable. Ahora validamos `undefined` primero y
  // devolvemos un mensaje claro listando los problemas reales.
  if (
    env.JWT_SECRET === undefined ||
    env.JWT_SECRET.length < PRODUCTION_JWT_SECRET_MIN_LENGTH
  ) {
    const actualLength = env.JWT_SECRET?.length ?? 0;
    problems.push(
      `JWT_SECRET must be at least ${PRODUCTION_JWT_SECRET_MIN_LENGTH} characters in production (got ${actualLength})`,
    );
  }

  if (
    env.DATABASE_PASSWORD === undefined ||
    env.DATABASE_PASSWORD.length < PRODUCTION_DATABASE_PASSWORD_MIN_LENGTH
  ) {
    const actualLength = env.DATABASE_PASSWORD?.length ?? 0;
    problems.push(
      `DATABASE_PASSWORD must be at least ${PRODUCTION_DATABASE_PASSWORD_MIN_LENGTH} characters in production (got ${actualLength})`,
    );
  }
  if (
    env.DATABASE_PASSWORD !== undefined &&
    isTrivialDatabasePassword(env.DATABASE_PASSWORD)
  ) {
    problems.push(`DATABASE_PASSWORD is a trivial value and is not allowed in production`);
  }

  if (env.CORS_ORIGINS === undefined || env.CORS_ORIGINS.trim() === '') {
    problems.push('CORS_ORIGINS must be defined in production (no open CORS)');
  } else if (isWildcardCORSOrigins(env.CORS_ORIGINS)) {
    // El paquete `cors` con `origin: ['*']` no es valido para browsers: el header
    // `Access-Control-Allow-Origin: *` no se puede combinar con credenciales, y
    // cuando viene de un array el browser lo rechaza silenciosamente. En prod
    // exigimos origins explicitos.
    problems.push('CORS_ORIGINS cannot contain "*" in production (use explicit origins)');
  }

  if (problems.length > 0) {
    throw new Error(
      `Cannot boot in production without proper secrets. Check JWT_SECRET, DATABASE_PASSWORD, CORS_ORIGINS. ${problems.join('; ')}`,
    );
  }
}

/**
 * Punto de entrada sincronico para la CLI de TypeORM (`data-source.ts`).
 * Aplica las reglas de produccion contra el `rawConfig` recibido, sin pasar
 * por ConfigModule ni por `validateOrReject`. Util cuando se quiere correr
 * `pnpm migration:run` y forzar el mismo hardening que tendra el boot de la app.
 *
 * Renombrada desde `validateProductionConfig` (B1): el nombre viejo implicaba
 * "validar la configuracion", pero la funcion NO corre las reglas de formato
 * de class-validator - solo aplica las cross-field de hardening. El nuevo
 * nombre describe mejor el side effect real: lanza si la configuracion de
 * produccion NO esta endurecida.
 */
export function assertProductionHardeningSync(rawConfig: Record<string, unknown>): void {
  const env = plainToInstance(EnvVars, rawConfig, { enableImplicitConversion: true });
  if (env.NODE_ENV === NodeEnv.Production) {
    assertProductionHardening(env);
  }
}

/**
 * Validador consumido por `ConfigModule.forRoot({ validate })`.
 * 1. Aplica las reglas de class-validator (rangos, formatos, presencia).
 * 2. Aplica invariantes cross-field cuando `NODE_ENV === 'production'`:
 *    - `JWT_SECRET` con al menos 32 caracteres.
 *    - `DATABASE_PASSWORD` con al menos 12 caracteres y fuera de la blacklist trivial.
 *    - `CORS_ORIGINS` definido y sin `*` (no se acepta CORS abierto en produccion).
 *
 * Trabaja sobre `rawConfig` (no sobre `process.env`) para que la validacion
 * refleje el input real y no acoplarse a side-effects globales del entorno.
 */
export async function validateEnv(
  rawConfig: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const validated = plainToInstance(EnvVars, rawConfig, { enableImplicitConversion: true });
  await validateOrReject(validated, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  if (validated.NODE_ENV === NodeEnv.Production) {
    assertProductionHardening(validated);
  }

  return rawConfig;
}
