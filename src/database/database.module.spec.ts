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

    const buildMockConfigService = (values: Record<string, unknown> = configValues): ConfigService =>
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

      // B6: usamos `toEqual` con el objeto entero (incluyendo el array de
      // `migrations` que ya validamos aparte) para que cualquier drift futuro
      // - un campo nuevo agregado al factory, un cambio de tipo, etc. -
      // rompa el test y el dev lo arregle en vez de pasar silenciosamente.
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
        migrationsRun: false,
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

    it('disables migrationsRun so CI/CD controls the migration lifecycle', () => {
      // DECISION ARQUITECTONICA: `migrationsRun: false` por diseno. Ver
      // comentario en `buildTypeOrmOptions` y `DOCS/TODO.md`. El flag
      // queda pinned en el spec para que un cambio accidental a `true`
      // rompa el test y el dev lo confirme a proposito.
      const options = buildTypeOrmOptions(buildMockConfigService());
      expect(options.migrationsRun).toBe(false);
    });

    it('sets timeouts so a hung database cannot block the pool indefinitely (WARNING #1)', () => {
      // Si Postgres cuelga sin rechazar, los defaults de `pg` son infinitos
      // (`connectionTimeoutMillis: 0`). El health probe comparte el pool con
      // el resto de la app: un hang tira todo abajo. Los caps duros
      // (`connectTimeoutMS`, `extra.statement_timeout`, `extra.query_timeout`)
      // cortan por lo sano en 5s.
      // Cast: `TypeOrmModuleOptions = Partial<DataSourceOptions>` (union) y el
      // narrow del literal `type: 'postgres'` se pierde al asignar el retorno
      // a una variable. La forma production sigue siendo type-safe; este cast
      // es solo para acceder a campos especificos de Postgres en el spec.
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
