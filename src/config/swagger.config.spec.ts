import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { setupSwagger } from './swagger.config';

interface SetupCall {
  path: string;
  app: unknown;
  document: unknown;
}

interface CreateDocumentCall {
  app: unknown;
  config: unknown;
}

const buildAppMock = (): {
  app: unknown;
  setupCalls: SetupCall[];
  createDocumentCalls: CreateDocumentCall[];
} => {
  const setupCalls: SetupCall[] = [];
  const createDocumentCalls: CreateDocumentCall[] = [];
  const app = {} as { [key: string]: unknown };
  return {
    app,
    setupCalls,
    createDocumentCalls,
  };
};

const buildConfigMock = (overrides: Record<string, unknown> = {}): ConfigService => {
  const values: Record<string, unknown> = {
    nodeEnv: 'development',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
};

describe('setupSwagger', () => {
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let setupSpy: jest.SpyInstance;
  let createDocumentSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    setupSpy = jest.spyOn(SwaggerModule, 'setup').mockImplementation(() => undefined);
    createDocumentSpy = jest.spyOn(SwaggerModule, 'createDocument').mockReturnValue({} as never);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    setupSpy.mockRestore();
    createDocumentSpy.mockRestore();
  });

  it('does not mount Swagger UI in production (WARNING: surface area disclosure)', () => {
    const { app } = buildAppMock();
    const configService = buildConfigMock({ nodeEnv: 'production' });

    setupSwagger(app as never, configService);

    expect(setupSpy).not.toHaveBeenCalled();
    expect(createDocumentSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/production/);
  });

  it('mounts Swagger UI in development', () => {
    const { app } = buildAppMock();
    const configService = buildConfigMock({ nodeEnv: 'development' });

    setupSwagger(app as never, configService);

    expect(createDocumentSpy).toHaveBeenCalledTimes(1);
    expect(setupSpy).toHaveBeenCalledTimes(1);
    expect(setupSpy.mock.calls[0]?.[0]).toBe('api/docs');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]?.[0]).toMatch(/Swagger UI available/);
  });

  it('mounts Swagger UI in test environment (NODE_ENV=test)', () => {
    const { app } = buildAppMock();
    const configService = buildConfigMock({ nodeEnv: 'test' });

    setupSwagger(app as never, configService);

    expect(setupSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to development behavior when nodeEnv is undefined in ConfigService', () => {
    const { app } = buildAppMock();
    const configService = buildConfigMock({ nodeEnv: undefined });

    setupSwagger(app as never, configService);

    expect(setupSpy).toHaveBeenCalledTimes(1);
  });
});
