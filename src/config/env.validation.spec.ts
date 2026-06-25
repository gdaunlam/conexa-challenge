import { NodeEnv, validateEnv, validateEnvSync } from './env.validation';

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
  };

  const expectRejected = async (
    rawConfig: Record<string, unknown> = process.env,
  ): Promise<void> => {
    await expect(validateEnv(rawConfig)).rejects.toBeDefined();
  };

  beforeEach(() => {
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
      process.env.JWT_SECRET = 'sixteen-chars-ok!!';
      await expect(validateEnv(process.env)).rejects.toThrow(/JWT_SECRET/);
    });

    it('rejects a production environment with a DATABASE_PASSWORD shorter than 12 chars', async () => {
      process.env.DATABASE_PASSWORD = 'short';
      await expect(validateEnv(process.env)).rejects.toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "postgres")', async () => {
      process.env.DATABASE_PASSWORD = 'postgres-1234567890ab';
      await expect(validateEnv(process.env)).rejects.toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "password")', async () => {
      process.env.DATABASE_PASSWORD = 'strong-but-contains-password-1234';
      await expect(validateEnv(process.env)).rejects.toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "changeme")', async () => {
      process.env.DATABASE_PASSWORD = 'changeme-but-32-chars-padding-1234';
      await expect(validateEnv(process.env)).rejects.toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "secret")', async () => {
      process.env.DATABASE_PASSWORD = 'a-secret-password-1234567890ab';
      await expect(validateEnv(process.env)).rejects.toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "admin")', async () => {
      process.env.DATABASE_PASSWORD = 'admin1234567890ab';
      await expect(validateEnv(process.env)).rejects.toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with BCRYPT_COST < 10 (WARNING #2: cost min hardening)', async () => {
      process.env.BCRYPT_COST = '4';
      await expect(validateEnv(process.env)).rejects.toThrow(/BCRYPT_COST.*at least 10/);
    });

    it('accepts BCRYPT_COST=10 in production (boundary)', async () => {
      process.env.BCRYPT_COST = '10';
      await expect(validateEnv(process.env)).resolves.toBeDefined();
    });

    it('accepts BCRYPT_COST=4 in development (no production hardening applies)', async () => {
      process.env = { ...originalEnv, ...validDevEnv };
      process.env.BCRYPT_COST = '4';
      await expect(validateEnv(process.env)).resolves.toBeDefined();
    });
  });

  describe('argument-vs-process.env isolation', () => {
    it('reads from the rawConfig argument, not from process.env', async () => {
      process.env.NODE_ENV = NodeEnv.Production;
      process.env.JWT_SECRET = 'way-too-short';
      process.env.DATABASE_PASSWORD = 'postgres1234567890ab';

      const rawConfig = { ...validProdEnv };
      await expect(validateEnv(rawConfig)).resolves.toBeDefined();
    });

    it('rejects when the rawConfig argument has bad values even if process.env is clean', async () => {
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
      };

      await expect(validateEnv(badRawConfig)).rejects.toThrow(/DATABASE_PASSWORD/);
    });
  });
});

describe('validateEnvSync', () => {
  const validProdEnv: Record<string, string> = {
    NODE_ENV: NodeEnv.Production,
    JWT_SECRET: 'a-very-long-production-grade-jwt-secret-1234567890',
    DATABASE_PASSWORD: 'Xq-3fP9kL2mZ8sV4nQ7wR',
    BCRYPT_COST: '10',
  };

  it('passes when production config is fully hardened', () => {
    expect(() => validateEnvSync(validProdEnv)).not.toThrow();
  });

  it('does nothing for non-production envs (no production hardening applies)', () => {
    expect(() =>
      validateEnvSync({
        NODE_ENV: NodeEnv.Development,
        JWT_SECRET: 'a-long-enough-secret-for-tests-1234',
        DATABASE_PASSWORD: 'not-the-default-password',
      }),
    ).not.toThrow();
  });

  it('rejects a production hardening violation loud', () => {
    expect(() =>
      validateEnvSync({
        NODE_ENV: NodeEnv.Production,
        JWT_SECRET: 'too-short',
        DATABASE_PASSWORD: 'postgres1234567890ab',
      }),
    ).toThrow(/DATABASE_PASSWORD/);
  });

  it('rejects loud when JWT_SECRET is undefined in production (WARNING #2)', () => {
    expect(() =>
      validateEnvSync({
        NODE_ENV: NodeEnv.Production,
        DATABASE_PASSWORD: 'Xq-3fP9kL2mZ8sV4nQ7wR',
      }),
    ).toThrow(/JWT_SECRET.*at least 32 characters/);
  });

  it('rejects loud when DATABASE_PASSWORD is undefined in production (WARNING #2)', () => {
    expect(() =>
      validateEnvSync({
        NODE_ENV: NodeEnv.Production,
        JWT_SECRET: 'a-very-long-production-grade-jwt-secret-1234567890',
      }),
    ).toThrow(/DATABASE_PASSWORD.*at least 12 characters/);
  });

  it('rejects loud when both JWT_SECRET and DATABASE_PASSWORD are undefined in production', () => {
    expect(() =>
      validateEnvSync({
        NODE_ENV: NodeEnv.Production,
      }),
    ).toThrow(/(JWT_SECRET.*at least 32 characters.*DATABASE_PASSWORD.*at least 12 characters|DATABASE_PASSWORD.*at least 12 characters.*JWT_SECRET.*at least 32 characters)/s);
  });

  it('rejects loud when BCRYPT_COST < 10 in production (WARNING #2: cost min hardening)', () => {
    expect(() =>
      validateEnvSync({
        NODE_ENV: NodeEnv.Production,
        JWT_SECRET: 'a-very-long-production-grade-jwt-secret-1234567890',
        DATABASE_PASSWORD: 'Xq-3fP9kL2mZ8sV4nQ7wR',
        BCRYPT_COST: 4,
      }),
    ).toThrow(/BCRYPT_COST.*at least 10/);
  });
});