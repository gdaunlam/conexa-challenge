export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export interface JwtConfig {
  secret: string;
  ttlSeconds: number;
}

export interface BcryptConfig {
  cost: number;
}

export interface CorsConfig {
  origins: string[];
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  database: DatabaseConfig;
  jwt: JwtConfig;
  bcrypt: BcryptConfig;
  cors: CorsConfig;
}

const DEFAULT_PORT = 3000;
const DEFAULT_DATABASE_PORT = 5432;
const DEFAULT_JWT_TTL_SECONDS = 3600;
const DEFAULT_BCRYPT_COST = 10;

/**
 * Lanza error explicito si la env no esta presente. Se usa para secretos
 * y credenciales que no deben tener defaults inseguros: dejar que la app
 * arranque con `JWT_SECRET=change-me` o `DATABASE_PASSWORD=postgres` es
 * un footgun que el linter no detecta.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOrigins(value: string | undefined): string[] {
  if (value === undefined || value === '') {
    return [];
  }
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Lee las variables de entorno y devuelve la configuracion tipada del proyecto.
 * Falla rapido (throw) si falta `JWT_SECRET` o `DATABASE_PASSWORD`: el contrato
 * del proyecto no admite defaults inseguros para credenciales.
 * La validacion adicional (longitudes, blacklist, reglas de produccion) se hace
 * en `validateEnv` (env.validation.ts).
 */
export default function configuration(): AppConfig {
  const corsOrigins = parseOrigins(process.env.CORS_ORIGINS);

  return {
    port: parseInteger(process.env.PORT, DEFAULT_PORT),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    database: {
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: parseInteger(process.env.DATABASE_PORT, DEFAULT_DATABASE_PORT),
      username: process.env.DATABASE_USER ?? 'postgres',
      password: requireEnv('DATABASE_PASSWORD'),
      database: process.env.DATABASE_NAME ?? 'movies_db',
    },
    jwt: {
      secret: requireEnv('JWT_SECRET'),
      ttlSeconds: parseInteger(process.env.JWT_TTL_SECONDS, DEFAULT_JWT_TTL_SECONDS),
    },
    bcrypt: {
      cost: parseInteger(process.env.BCRYPT_COST, DEFAULT_BCRYPT_COST),
    },
    cors: {
      origins: corsOrigins,
    },
  };
}
