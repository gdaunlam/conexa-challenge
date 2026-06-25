import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
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
const PRODUCTION_BCRYPT_COST_MIN = 10;
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

  @IsString()
  @IsNotEmpty()
  DATABASE_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_NAME: string = 'movies_db';

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
}

function assertProductionHardening(env: EnvVars): void {
  const problems: string[] = [];

  if (env.JWT_SECRET === undefined || env.JWT_SECRET.length < PRODUCTION_JWT_SECRET_MIN_LENGTH) {
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
  if (env.DATABASE_PASSWORD !== undefined && isTrivialDatabasePassword(env.DATABASE_PASSWORD)) {
    problems.push(`DATABASE_PASSWORD is a trivial value and is not allowed in production`);
  }

  if (env.BCRYPT_COST === undefined || env.BCRYPT_COST < PRODUCTION_BCRYPT_COST_MIN) {
    const actual = env.BCRYPT_COST ?? 0;
    problems.push(
      `BCRYPT_COST must be at least ${PRODUCTION_BCRYPT_COST_MIN} in production (got ${actual})`,
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Cannot boot in production without proper secrets. Check JWT_SECRET, DATABASE_PASSWORD. ${problems.join('; ')}`,
    );
  }
}

export function assertProductionHardeningSync(rawConfig: Record<string, unknown>): void {
  const env = plainToInstance(EnvVars, rawConfig, { enableImplicitConversion: true });
  if (env.NODE_ENV === NodeEnv.Production) {
    assertProductionHardening(env);
  }
}

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
