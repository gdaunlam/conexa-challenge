import {
  assertProductionHardeningSync,
  NodeEnv,
  validateEnv,
} from './env.validation';

describe('validateEnv', () => {
  const originalEnv = { ...process.env };

  const validDevEnv: Record<string, string> = {
    NODE_ENV: NodeEnv.Development,
    PORT: '3000',
    DATABASE_HOST: 'localhost',
    DATABASE_PORT: '5432',
    DATABASE_USER: 'postgres',
    DATABASE_PASSWORD: 'not-the-default-password',
    DATABASE_NAME: 'movies_db',
    JWT_SECRET: 'a-long-enough-secret-for-tests-1234',
    JWT_TTL_SECONDS: '3600',
    BCRYPT_COST: '10',
  };

  const validProdEnv: Record<string, string> = {
    ...validDevEnv,
    NODE_ENV: NodeEnv.Production,
    JWT_SECRET: 'a-very-long-production-grade-jwt-secret-1234567890',
    DATABASE_PASSWORD: 'Xq-3fP9kL2mZ8sV4nQ7wR',
    CORS_ORIGINS: 'https://app.example.com',
  };

  const expectRejected = async (rawConfig: Record<string, unknown> = process.env): Promise<void> => {
    await expect(validateEnv(rawConfig)).rejects.toBeDefined();
  };

  beforeEach(() => {
    // Limpiamos el NODE_ENV de Jest (`test`) para que el test de "dev" no
    // termine corriendo las reglas de production hardening.
    process.env = { ...originalEnv, ...validDevEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts a valid development environment and returns the rawConfig unchanged', async () => {
    const rawConfig = { ...process.env };
    await expect(validateEnv(rawConfig)).resolves.toEqual(rawConfig);
  });

  it('treats NODE_ENV=test as development (no production hardening)', async () => {
    // B1: `validateEnv` no debe correr las reglas de produccion para NODE_ENV=test.
    // Es importante porque Jest setea NODE_ENV=test por defecto y los specs del
    // proyecto no deberian necesitar secretos de prod.
    process.env.NODE_ENV = NodeEnv.Test;
    process.env.JWT_SECRET = 'sixteen-chars-ok!!';
    process.env.DATABASE_PASSWORD = 'short';

    await expect(validateEnv(process.env)).resolves.toBeDefined();
  });

  it('rejects PORT outside the valid range', async () => {
    process.env.PORT = '99999';
    await expectRejected();
  });

  it('rejects JWT_SECRET shorter than 16 chars', async () => {
    process.env.JWT_SECRET = 'too-short';
    await expectRejected();
  });

  it('rejects missing JWT_SECRET', async () => {
    delete process.env.JWT_SECRET;
    await expectRejected();
  });

  it('rejects missing DATABASE_PASSWORD', async () => {
    delete process.env.DATABASE_PASSWORD;
    await expectRejected();
  });

  it('rejects empty DATABASE_PASSWORD', async () => {
    // B2: las env vars obligatorias que el class-validator marque con @IsNotEmpty
    // deben rechazar string vacio igual que ausencia. Cubre el caso de un `.env`
    // mal editado donde la linea existe pero sin valor.
    process.env.DATABASE_PASSWORD = '';
    await expectRejected();
  });

  it('rejects empty JWT_SECRET', async () => {
    process.env.JWT_SECRET = '';
    await expectRejected();
  });

  it('rejects BCRYPT_COST above 15', async () => {
    process.env.BCRYPT_COST = '20';
    await expectRejected();
  });

  it('rejects BCRYPT_COST below 4', async () => {
    process.env.BCRYPT_COST = '2';
    await expectRejected();
  });

  it('rejects invalid NODE_ENV value', async () => {
    process.env.NODE_ENV = 'staging';
    await expectRejected();
  });

  it('rejects an empty DATABASE_HOST', async () => {
    process.env.DATABASE_HOST = '';
    await expectRejected();
  });

  describe('production hardening', () => {
    beforeEach(() => {
      process.env = { ...originalEnv, ...validProdEnv };
    });

    it('accepts a fully hardened production environment', async () => {
      const rawConfig = { ...process.env };
      await expect(validateEnv(rawConfig)).resolves.toEqual(rawConfig);
    });

    it('rejects a production environment with a JWT_SECRET shorter than 32 chars', async () => {
      // 19 chars: pasa la regla base (>=16) pero no la de produccion (>=32).
      process.env.JWT_SECRET = 'sixteen-chars-ok!!';
      await expect(validateEnv(process.env)).rejects.toThrow(/JWT_SECRET/);
    });

    it('rejects a production environment with a DATABASE_PASSWORD shorter than 12 chars', async () => {
      process.env.DATABASE_PASSWORD = 'short';
      await expect(validateEnv(process.env)).rejects.toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "postgres")', async () => {
      // 25 chars, pasa la longitud minima, pero contiene la palabra prohibida.
      process.env.DATABASE_PASSWORD = 'postgres-1234567890ab';
      await expect(validateEnv(process.env)).rejects.toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "password")', async () => {
      // B3: cubre el substring "password" que no estaba testeado antes.
      process.env.DATABASE_PASSWORD = 'strong-but-contains-password-1234';
      await expect(validateEnv(process.env)).rejects.toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "changeme")', async () => {
      // B3: cubre el substring "changeme".
      process.env.DATABASE_PASSWORD = 'changeme-but-32-chars-padding-1234';
      await expect(validateEnv(process.env)).rejects.toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "secret")', async () => {
      // B3: cubre el substring "secret".
      process.env.DATABASE_PASSWORD = 'a-secret-password-1234567890ab';
      await expect(validateEnv(process.env)).rejects.toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "admin")', async () => {
      process.env.DATABASE_PASSWORD = 'admin1234567890ab';
      await expect(validateEnv(process.env)).rejects.toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment without CORS_ORIGINS', async () => {
      delete process.env.CORS_ORIGINS;
      await expect(validateEnv(process.env)).rejects.toThrow(/CORS_ORIGINS/);
    });

    it('rejects a production environment with empty CORS_ORIGINS', async () => {
      process.env.CORS_ORIGINS = '   ';
      await expect(validateEnv(process.env)).rejects.toThrow(/CORS_ORIGINS/);
    });

    it('rejects a production environment with CORS_ORIGINS="*"', async () => {
      // Cubre el caso de WARNING #3: el paquete `cors` no soporta bien `*` en
      // produccion (lo rechaza silenciosamente el browser).
      process.env.CORS_ORIGINS = '*';
      await expect(validateEnv(process.env)).rejects.toThrow(/\*/);
    });

    it('rejects a production environment with CORS_ORIGINS containing "*" mixed with other origins', async () => {
      // `https://app.com,*` es ambiguo: ?se permite cualquier origin o solo ese?
      process.env.CORS_ORIGINS = 'https://app.example.com,*';
      await expect(validateEnv(process.env)).rejects.toThrow(/\*/);
    });
  });

  describe('argument-vs-process.env isolation', () => {
    // WARNING #4: `validateEnv` debe operar sobre el argumento `rawConfig`,
    // no sobre `process.env`. Esto evita que un loader custom (que setea
    // valores en otro lugar) termine pasando la validacion pero con
    // configuracion inconsistente.
    it('reads from the rawConfig argument, not from process.env', async () => {
      // Seteamos process.env con secretos que NO pasarian las reglas de prod
      // (deben fallar si la implementacion leyera process.env).
      process.env.NODE_ENV = NodeEnv.Production;
      process.env.JWT_SECRET = 'way-too-short';
      process.env.DATABASE_PASSWORD = 'postgres1234567890ab';
      process.env.CORS_ORIGINS = undefined;

      // Pero el argumento trae valores validos: la validacion debe pasar.
      const rawConfig = { ...validProdEnv };
      await expect(validateEnv(rawConfig)).resolves.toBeDefined();
    });

    it('rejects when the rawConfig argument has bad values even if process.env is clean', async () => {
      // Caso inverso: process.env esta limpio (valido), pero el argumento rompe
      // las reglas. La validacion debe fallar porque trabaja con el argumento.
      process.env = { ...originalEnv, ...validDevEnv };

      const badRawConfig = {
        NODE_ENV: NodeEnv.Production,
        PORT: 3000,
        DATABASE_HOST: 'localhost',
        DATABASE_PORT: 5432,
        DATABASE_USER: 'postgres',
        DATABASE_PASSWORD: 'short',
        DATABASE_NAME: 'movies_db',
        JWT_SECRET: 'sixteen-chars-ok!!',
        JWT_TTL_SECONDS: 3600,
        BCRYPT_COST: 10,
        CORS_ORIGINS: 'https://app.example.com',
      };

      await expect(validateEnv(badRawConfig)).rejects.toThrow(/DATABASE_PASSWORD/);
    });
  });
});

describe('assertProductionHardeningSync', () => {
  // CRITICAL #1: la CLI de TypeORM (`data-source.ts`) no pasa por ConfigModule,
  // asi que `validateEnv` no corre. `assertProductionHardeningSync` es la barrera
  // sincronica que `data-source.ts` invoca para forzar el mismo hardening.
  const originalEnv = { ...process.env };

  const validProdEnv: Record<string, string> = {
    NODE_ENV: NodeEnv.Production,
    JWT_SECRET: 'a-very-long-production-grade-jwt-secret-1234567890',
    DATABASE_PASSWORD: 'Xq-3fP9kL2mZ8sV4nQ7wR',
    CORS_ORIGINS: 'https://app.example.com',
  };

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects a production hardening violation loud', () => {
    expect(() =>
      assertProductionHardeningSync({
        NODE_ENV: NodeEnv.Production,
        JWT_SECRET: 'too-short',
        DATABASE_PASSWORD: 'postgres1234567890ab',
      }),
    ).toThrow(/DATABASE_PASSWORD/);
  });

  it('passes when production config is fully hardened', () => {
    expect(() => assertProductionHardeningSync(validProdEnv)).not.toThrow();
  });

  it('does nothing for non-production envs (no class-validator rules apply)', () => {
    // Garantiza que `assertProductionHardeningSync` no rompe el flujo de `data-source.ts`
    // cuando NODE_ENV != production (caso dev/test).
    expect(() =>
      assertProductionHardeningSync({
        NODE_ENV: NodeEnv.Development,
        JWT_SECRET: 'a-long-enough-secret-for-tests-1234',
        DATABASE_PASSWORD: 'not-the-default-password',
      }),
    ).not.toThrow();
  });

  it('rejects loud (not TypeError) when JWT_SECRET is undefined in production (WARNING #2)', () => {
    // R1 W2: si el operador corre `pnpm migration:run` con NODE_ENV=production
    // y sin JWT_SECRET seteado, el mensaje debe ser accionable ("JWT_SECRET must
    // be at least 32 characters in production (got 0)"), NO un TypeError
    // críptico de "Cannot read properties of undefined (reading 'length')".
    expect(() =>
      assertProductionHardeningSync({
        NODE_ENV: NodeEnv.Production,
        DATABASE_PASSWORD: 'Xq-3fP9kL2mZ8sV4nQ7wR',
        CORS_ORIGINS: 'https://app.example.com',
      }),
    ).toThrow(/JWT_SECRET.*at least 32 characters/);
  });

  it('rejects loud (not TypeError) when DATABASE_PASSWORD is undefined in production (WARNING #2)', () => {
    expect(() =>
      assertProductionHardeningSync({
        NODE_ENV: NodeEnv.Production,
        JWT_SECRET: 'a-very-long-production-grade-jwt-secret-1234567890',
        CORS_ORIGINS: 'https://app.example.com',
      }),
    ).toThrow(/DATABASE_PASSWORD.*at least 12 characters/);
  });

  it('rejects loud when both JWT_SECRET and DATABASE_PASSWORD are undefined in production', () => {
    // Cubre el caso peor: el operador no setea ninguno. El mensaje lista
    // ambos problemas para que los arregle en una sola pasada.
    expect(() =>
      assertProductionHardeningSync({
        NODE_ENV: NodeEnv.Production,
        CORS_ORIGINS: 'https://app.example.com',
      }),
    ).toThrow(/JWT_SECRET.*at least 32 characters.*DATABASE_PASSWORD.*at least 12 characters/s);
  });
});
