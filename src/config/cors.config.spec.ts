import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { bootstrapCors } from './cors.config';

const TRACE_ID_HEADER = 'X-Trace-Id';

interface CorsCall {
  options: CorsOptions;
}

const buildAppMock = (): { app: { enableCors: jest.Mock }; calls: CorsCall[] } => {
  const calls: CorsCall[] = [];
  const app = {
    enableCors: jest.fn((options: CorsOptions) => {
      calls.push({ options });
    }),
  };
  return { app, calls };
};

const buildConfigMock = (overrides: Record<string, unknown> = {}): ConfigService => {
  const values: Record<string, unknown> = {
    nodeEnv: 'development',
    'cors.origins': [],
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
};

describe('bootstrapCors', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('throws when nodeEnv is not set in ConfigService (B3: defense-in-depth)', () => {
    // `validateEnv` ya garantiza la presencia de `nodeEnv` en runtime, pero
    // si un caller futuro invoca `bootstrapCors` antes del pipeline (test,
    // script, refactor), preferimos throw loud a caer silenciosamente en
    // `'development'` y abrir CORS por accidente en un contexto production.
    const { app } = buildAppMock();
    const configService = buildConfigMock({ nodeEnv: undefined });

    expect(() => bootstrapCors(app as never, configService)).toThrow(/nodeEnv/);
    expect(app.enableCors).not.toHaveBeenCalled();
  });

  it('throws in production when CORS_ORIGINS is not set', () => {
    const { app } = buildAppMock();
    const configService = buildConfigMock({
      nodeEnv: 'production',
      'cors.origins': [],
    });

    expect(() => bootstrapCors(app as never, configService)).toThrow(/CORS_ORIGINS/);
    expect(app.enableCors).not.toHaveBeenCalled();
  });

  it('configures explicit origins with credentials disabled and exposes X-Trace-Id', () => {
    const { app, calls } = buildAppMock();
    const configService = buildConfigMock({
      nodeEnv: 'production',
      'cors.origins': ['https://app.example.com', 'https://admin.example.com'],
    });

    bootstrapCors(app as never, configService);

    expect(app.enableCors).toHaveBeenCalledTimes(1);
    expect(calls[0]?.options).toEqual({
      origin: ['https://app.example.com', 'https://admin.example.com'],
      credentials: false,
      exposedHeaders: [TRACE_ID_HEADER],
    });
  });

  it('warns and enables wildcard CORS (as boolean) in development without CORS_ORIGINS', () => {
    const { app, calls } = buildAppMock();
    const configService = buildConfigMock({
      nodeEnv: 'development',
      'cors.origins': [],
    });

    bootstrapCors(app as never, configService);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/CORS_ORIGINS/);
    expect(calls[0]?.options).toEqual({
      origin: true,
      credentials: false,
      exposedHeaders: [TRACE_ID_HEADER],
    });
  });

  it('normalizes a CORS_ORIGINS="*" to boolean true (avoids broken array wildcard)', () => {
    // WARNING #3: el paquete `cors` con `origin: ['*']` (array) hace que el
    // browser rechace silenciosamente. Hay que pasar boolean `true` para que
    // emita el header `Access-Control-Allow-Origin: *` correcto.
    const { app, calls } = buildAppMock();
    const configService = buildConfigMock({
      nodeEnv: 'development',
      'cors.origins': ['*'],
    });

    bootstrapCors(app as never, configService);

    expect(calls[0]?.options.origin).toBe(true);
  });

  it('keeps explicit origins as an array when at least one is not "*"', () => {
    const { app, calls } = buildAppMock();
    const configService = buildConfigMock({
      nodeEnv: 'development',
      'cors.origins': ['https://app.example.com', '*'],
    });

    bootstrapCors(app as never, configService);

    // Mezclar un origin explicito con `*` es ambiguo. Preferimos respetar la
    // lista explicita del operador a aplicar el wildcard que `cors` no
    // entiende bien. (La validacion de prod rechaza esto en `assertProductionHardening`;
    // en dev pasamos la lista tal cual.)
    expect(calls[0]?.options.origin).toEqual(['https://app.example.com', '*']);
  });

  // B7: el test "always exposes X-Trace-Id in the response headers" se elimina
  // porque es redundante: los specs previos ("configures explicit origins...",
  // "warns and enables wildcard CORS...") ya assertan contra
  // `exposedHeaders: [TRACE_ID_HEADER]` en cada rama. Quedarse con un test
  // adicional que solo repite la asercion agrega ruido sin agregar cobertura.
});
