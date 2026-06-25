import configuration from './configuration';

describe('configuration factory', () => {
  const originalEnv = { ...process.env };

  const requiredEnv: Record<string, string> = {
    JWT_SECRET: 'a-long-enough-secret-for-tests-1234',
    DATABASE_PASSWORD: 'not-the-default-password',
  };

  beforeEach(() => {
    const envWithoutNodeEnv = { ...originalEnv };
    delete envWithoutNodeEnv.NODE_ENV;
    process.env = { ...envWithoutNodeEnv, ...requiredEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns the full config when all required envs are set', () => {
    const config = configuration();

    expect(config).toEqual({
      port: 3000,
      nodeEnv: 'development',
      database: {
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'not-the-default-password',
        database: 'movies_db',
      },
      jwt: {
        secret: 'a-long-enough-secret-for-tests-1234',
        ttlSeconds: 3600,
      },
      bcrypt: {
        cost: 10,
      },
    });
  });

  it('reads overrides from process.env', () => {
    process.env.PORT = '4000';
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_HOST = 'db.local';
    process.env.DATABASE_PORT = '6543';
    process.env.JWT_TTL_SECONDS = '7200';
    process.env.BCRYPT_COST = '12';

    const config = configuration();

    expect(config.port).toBe(4000);
    expect(config.nodeEnv).toBe('production');
    expect(config.database.host).toBe('db.local');
    expect(config.database.port).toBe(6543);
    expect(config.jwt.ttlSeconds).toBe(7200);
    expect(config.bcrypt.cost).toBe(12);
  });

  it('coerces numeric env values from strings', () => {
    process.env.PORT = '8080';

    const config = configuration();

    expect(config.port).toBe(8080);
    expect(typeof config.port).toBe('number');
  });

  it('falls back to defaults when numeric env is invalid', () => {
    process.env.PORT = 'not-a-number';

    const config = configuration();

    expect(config.port).toBe(3000);
  });

  it('throws when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;

    expect(() => configuration()).toThrow('JWT_SECRET');
  });

  it('throws when DATABASE_PASSWORD is missing', () => {
    delete process.env.DATABASE_PASSWORD;

    expect(() => configuration()).toThrow('DATABASE_PASSWORD');
  });

  it('treats an empty JWT_SECRET as missing (B2: string vacio)', () => {
    process.env.JWT_SECRET = '';

    expect(() => configuration()).toThrow('JWT_SECRET');
  });

  it('treats an empty DATABASE_PASSWORD as missing (B2: string vacio)', () => {
    process.env.DATABASE_PASSWORD = '';

    expect(() => configuration()).toThrow('DATABASE_PASSWORD');
  });
});
