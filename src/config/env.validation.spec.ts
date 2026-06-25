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

  const expectRejected = (rawConfig: Record<string, unknown> = process.env): void => {
    expect(() => validateEnv(rawConfig)).toThrow();
  };

  beforeEach(() => {
    process.env = { ...originalEnv, ...validDevEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts a valid development environment and returns the rawConfig unchanged', () => {
    const rawConfig = { ...process.env };
    expect(validateEnv(rawConfig)).toEqual(rawConfig);
  });

  it('treats NODE_ENV=test as development (no production hardening)', () => {
    process.env.NODE_ENV = NodeEnv.Test;
    process.env.JWT_SECRET = 'sixteen-chars-ok!!';
    process.env.DATABASE_PASSWORD = 'short';

    expect(validateEnv(process.env)).toBeDefined();
  });

  it('rejects PORT outside the valid range', () => {
    process.env.PORT = '99999';
    expectRejected();
  });

  it('rejects JWT_SECRET shorter than 16 chars', () => {
    process.env.JWT_SECRET = 'too-short';
    expectRejected();
  });

  it('rejects missing JWT_SECRET', () => {
    delete process.env.JWT_SECRET;
    expectRejected();
  });

  it('rejects missing DATABASE_PASSWORD', () => {
    delete process.env.DATABASE_PASSWORD;
    expectRejected();
  });

  it('rejects empty DATABASE_PASSWORD', () => {
    process.env.DATABASE_PASSWORD = '';
    expectRejected();
  });

  it('rejects empty JWT_SECRET', () => {
    process.env.JWT_SECRET = '';
    expectRejected();
  });

  it('rejects BCRYPT_COST above 15', () => {
    process.env.BCRYPT_COST = '20';
    expectRejected();
  });

  it('rejects BCRYPT_COST below 4', () => {
    process.env.BCRYPT_COST = '2';
    expectRejected();
  });

  it('rejects invalid NODE_ENV value', () => {
    process.env.NODE_ENV = 'staging';
    expectRejected();
  });

  it('rejects an empty DATABASE_HOST', () => {
    process.env.DATABASE_HOST = '';
    expectRejected();
  });

  describe('production hardening', () => {
    beforeEach(() => {
      process.env = { ...originalEnv, ...validProdEnv };
    });

    it('accepts a fully hardened production environment', () => {
      const rawConfig = { ...process.env };
      expect(validateEnv(rawConfig)).toEqual(rawConfig);
    });

    it('rejects a production environment with a JWT_SECRET shorter than 32 chars', () => {
      process.env.JWT_SECRET = 'sixteen-chars-ok!!';
      expect(() => validateEnv(process.env)).toThrow(/JWT_SECRET/);
    });

    it('rejects a production environment with a DATABASE_PASSWORD shorter than 12 chars', () => {
      process.env.DATABASE_PASSWORD = 'short';
      expect(() => validateEnv(process.env)).toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "postgres")', () => {
      process.env.DATABASE_PASSWORD = 'postgres-1234567890ab';
      expect(() => validateEnv(process.env)).toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "password")', () => {
      process.env.DATABASE_PASSWORD = 'strong-but-contains-password-1234';
      expect(() => validateEnv(process.env)).toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "changeme")', () => {
      process.env.DATABASE_PASSWORD = 'changeme-but-32-chars-padding-1234';
      expect(() => validateEnv(process.env)).toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "secret")', () => {
      process.env.DATABASE_PASSWORD = 'a-secret-password-1234567890ab';
      expect(() => validateEnv(process.env)).toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with a trivial DATABASE_PASSWORD (contains "admin")', () => {
      process.env.DATABASE_PASSWORD = 'admin1234567890ab';
      expect(() => validateEnv(process.env)).toThrow(/DATABASE_PASSWORD/);
    });

    it('rejects a production environment with BCRYPT_COST < 10 (WARNING #2: cost min hardening)', () => {
      process.env.BCRYPT_COST = '4';
      expect(() => validateEnv(process.env)).toThrow(/BCRYPT_COST.*at least 10/);
    });

    it('accepts BCRYPT_COST=10 in production (boundary)', () => {
      process.env.BCRYPT_COST = '10';
      expect(validateEnv(process.env)).toBeDefined();
    });

    it('accepts BCRYPT_COST=4 in development (no production hardening applies)', () => {
      process.env = { ...originalEnv, ...validDevEnv };
      process.env.BCRYPT_COST = '4';
      expect(validateEnv(process.env)).toBeDefined();
    });
  });

  describe('argument-vs-process.env isolation', () => {
    it('reads from the rawConfig argument, not from process.env', () => {
      process.env.NODE_ENV = NodeEnv.Production;
      process.env.JWT_SECRET = 'way-too-short';
      process.env.DATABASE_PASSWORD = 'postgres1234567890ab';

      const rawConfig = { ...validProdEnv };
      expect(validateEnv(rawConfig)).toBeDefined();
    });

    it('rejects when the rawConfig argument has bad values even if process.env is clean', () => {
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

      expect(() => validateEnv(badRawConfig)).toThrow(/DATABASE_PASSWORD/);
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