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

export interface AppConfig {
  port: number;
  nodeEnv: string;
  database: DatabaseConfig;
  jwt: JwtConfig;
  bcrypt: BcryptConfig;
}

const DEFAULT_PORT = 3000;
const DEFAULT_DATABASE_PORT = 5432;
const DEFAULT_JWT_TTL_SECONDS = 3600;
const DEFAULT_BCRYPT_COST = 10;

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

export default function configuration(): AppConfig {
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
  };
}
