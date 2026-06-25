import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidationError,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const PRODUCTION_GROUP = 'production';
const DEFAULT_GROUP = 'default';

const TRIVIAL_DATABASE_PASSWORD_SUBSTRINGS: readonly string[] = [
  'postgres',
  'password',
  'admin',
  'changeme',
  'secret',
];

const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TRIVIAL_PASSWORD_PATTERN = new RegExp(
  `^(?!.*(?:${TRIVIAL_DATABASE_PASSWORD_SUBSTRINGS.map(escapeRegex).join('|')})).+$`,
  'i',
);

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
  @MinLength(12, {
    groups: [PRODUCTION_GROUP],
    message: 'DATABASE_PASSWORD must be at least 12 characters in production',
  })
  @Matches(TRIVIAL_PASSWORD_PATTERN, {
    groups: [PRODUCTION_GROUP],
    message: `DATABASE_PASSWORD must not contain forbidden substrings: ${TRIVIAL_DATABASE_PASSWORD_SUBSTRINGS.join(', ')}`,
  })
  DATABASE_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_NAME: string = 'movies_db';

  @IsString()
  @IsNotEmpty()
  @MinLength(16, {
    groups: [DEFAULT_GROUP],
    message: 'JWT_SECRET must be at least 16 characters',
  })
  @MinLength(32, {
    groups: [PRODUCTION_GROUP],
    message: 'JWT_SECRET must be at least 32 characters in production',
  })
  JWT_SECRET!: string;

  @IsInt()
  @Min(60)
  JWT_TTL_SECONDS: number = 3600;

  @IsInt()
  @Min(4)
  @Max(15)
  @Min(10, {
    groups: [PRODUCTION_GROUP],
    message: 'BCRYPT_COST must be at least 10 in production',
  })
  BCRYPT_COST: number = 10;
}

const SHARED_VALIDATE_OPTIONS = {
  whitelist: true,
  forbidNonWhitelisted: false,
  always: true,
  strictGroups: true,
} as const;

const groupsFor = (env: EnvVars): string[] =>
  env.NODE_ENV === NodeEnv.Production ? [PRODUCTION_GROUP] : [DEFAULT_GROUP];

export function validateEnv(
  rawConfig: Record<string, unknown>,
): Record<string, unknown> {
  const validated = plainToInstance(EnvVars, rawConfig, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    ...SHARED_VALIDATE_OPTIONS,
    groups: groupsFor(validated),
  });
  if (errors.length > 0) {
    throw new Error(formatValidationErrors(errors));
  }
  return rawConfig;
}

export const validateEnvSync = validateEnv;

function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .map((error) => {
      const constraints = Object.values(error.constraints ?? {});
      return constraints.join(', ');
    })
    .join('; ');
}