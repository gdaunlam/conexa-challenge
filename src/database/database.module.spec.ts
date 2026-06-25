import { ConfigService } from '@nestjs/config';
import { buildTypeOrmOptions } from './database.module';

describe('DatabaseModule', () => {
  describe('buildTypeOrmOptions factory', () => {
    const configValues: Record<string, unknown> = {
      'database.host': 'localhost',
      'database.port': 5432,
      'database.username': 'user',
      'database.password': 'pass',
      'database.database': 'movies',
    };

    const buildMockConfigService = (
      values: Record<string, unknown> = configValues,
    ): ConfigService =>
      ({
        getOrThrow: jest.fn((key: string) => {
          if (!(key in values)) {
            throw new Error(`Missing required config key: ${key}`);
          }
          return values[key];
        }),
      }) as unknown as ConfigService;

    it('builds TypeORM options from a ConfigService', () => {
      const options = buildTypeOrmOptions(buildMockConfigService());

      expect(options).toEqual({
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        username: 'user',
        password: 'pass',
        database: 'movies',
        autoLoadEntities: true,
        synchronize: false,
        migrations: expect.arrayContaining([expect.stringContaining('migrations')]),
        migrationsRun: true,
        connectTimeoutMS: 5000,
        extra: {
          statement_timeout: 5000,
          query_timeout: 5000,
        },
      });
    });

    it('points migrations at the src/database/migrations directory', () => {
      const options = buildTypeOrmOptions(buildMockConfigService());

      const migrations = options.migrations;
      expect(Array.isArray(migrations)).toBe(true);
      const entries = migrations as string[];
      expect(entries.some((entry) => entry.includes('migrations'))).toBe(true);
    });

    it('runs pending migrations on bootstrap so the tester does not need to invoke them manually', () => {
      const options = buildTypeOrmOptions(buildMockConfigService());
      expect(options.migrationsRun).toBe(true);
    });

    it('sets timeouts so a hung database cannot block the pool indefinitely (WARNING #1)', () => {
      const options = buildTypeOrmOptions(buildMockConfigService()) as unknown as {
        connectTimeoutMS?: number;
        extra?: { statement_timeout: number; query_timeout: number };
      };

      expect(options.connectTimeoutMS).toBe(5000);

      const extra = options.extra;
      expect(extra?.statement_timeout).toBe(5000);
      expect(extra?.query_timeout).toBe(5000);
    });

    it('throws when a required key is missing', () => {
      const incomplete = {
        'database.host': 'localhost',
        'database.port': 5432,
      };
      const configService = buildMockConfigService(incomplete);

      expect(() => buildTypeOrmOptions(configService)).toThrow('database.username');
    });
  });
});
