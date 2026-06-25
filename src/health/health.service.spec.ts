import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DATABASE_UNAVAILABLE_MESSAGE, DatabaseErrorCategory, HealthService } from './health.service';

describe('HealthService', () => {
  const buildService = (queryImpl: jest.Mock): HealthService => {
    const dataSource = { query: queryImpl } as unknown as DataSource;
    return new HealthService(dataSource);
  };

  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Capturamos las llamadas a Logger.error para verificar que el log incluya
    // la categoria y el mensaje crudo sin filtrar PII al response.
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns the documented shape when SELECT 1 resolves', async () => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = buildService(query);

    const result = await service.check();

    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(result.status).toBe('ok');
    expect(typeof result.timestamp).toBe('string');
    expect(typeof result.uptime).toBe('number');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });

  it('throws ServiceUnavailableException (503) with details: null when the probe rejects', async () => {
    // CRITICAL #1 (R3 C1): el response 503 debe cumplir el shape del spec
    // seccion 6 (`details: array | null`). Pasar un objeto hacia `details`
    // hace que el `HttpExceptionFilter` lo descarte; el operador perderia la
    // razon. Verificamos que la excepcion lleva `details: null` literal para
    // que el filter lo propague tal cual al response.
    const query = jest.fn().mockRejectedValue(new Error('Connection terminated'));
    const service = buildService(query);

    await expect(service.check()).rejects.toBeInstanceOf(ServiceUnavailableException);

    try {
      await service.check();
    } catch (caught) {
      expect(caught).toBeInstanceOf(ServiceUnavailableException);
      const exception = caught as ServiceUnavailableException;
      expect(exception.getStatus()).toBe(503);
      const response = exception.getResponse() as Record<string, unknown>;
      expect(response).toMatchObject({
        error: 'Service Unavailable',
        message: DATABASE_UNAVAILABLE_MESSAGE,
        details: null,
      });
      // Garantiza que NO se cuela un objeto en `details` que el filter
      // descartaria (es exactamente el bug que estamos cerrando).
      expect(response['details']).toBeNull();
    }
  });

  it('does not leak raw error messages to the response (CRITICAL #1 info-leak fix)', async () => {
    // El mensaje crudo del driver puede contener host:port, usuarios de DB,
    // paths internos, etc. (ej. `ECONNREFUSED 127.0.0.1:5432`,
    // `password authentication failed for user "X"`). El response debe llevar
    // solo el mensaje generico, nunca el raw.
    const leakyMessage = 'ECONNREFUSED 127.0.0.1:5432 password authentication failed for user "admin"';
    const query = jest.fn().mockRejectedValue(new Error(leakyMessage));
    const service = buildService(query);

    try {
      await service.check();
      throw new Error('expected rejection');
    } catch (caught) {
      const exception = caught as ServiceUnavailableException;
      const response = exception.getResponse() as Record<string, unknown>;
      const serialized = JSON.stringify(response);
      expect(serialized).not.toContain('127.0.0.1');
      expect(serialized).not.toContain('5432');
      expect(serialized).not.toContain('password authentication');
      expect(serialized).not.toContain('admin');
      // El mensaje publico es el generico del proyecto, no el del driver.
      expect(response['message']).toBe(DATABASE_UNAVAILABLE_MESSAGE);
    }
  });

  it('logs the category and the raw message server-side when the probe rejects', async () => {
    // El operador no ve la categoria en el response (shape del spec), pero
    // la ve en logs. Esto le permite clasificar el incidente sin filtrar
    // PII al cliente. La categoria se loguea junto al mensaje crudo.
    const query = jest.fn().mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }),
    );
    const service = buildService(query);

    await expect(service.check()).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0]?.[0] as string;
    expect(logged).toMatch(/category=database_unreachable/);
    expect(logged).toContain('connect ECONNREFUSED 127.0.0.1:5432');
  });

  type CategoryCase = [label: string, message: string, code: string | undefined, expected: DatabaseErrorCategory];

  const categoryCases: CategoryCase[] = [
    ['ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:5432', 'ECONNREFUSED', 'database_unreachable'],
    ['ENOTFOUND (DNS resolution failure)', 'getaddrinfo ENOTFOUND db.local', 'ENOTFOUND', 'database_unreachable'],
    ['ECONNRESET', 'read ECONNRESET', 'ECONNRESET', 'connection_lost'],
    [
      'terminating connection due to administrator command',
      'terminating connection due to administrator command',
      undefined,
      'connection_lost',
    ],
    ['ETIMEDOUT', 'timeout exceeded', 'ETIMEDOUT', 'query_timeout'],
    ['Postgres statement_timeout (code 57014)', 'canceling statement due to statement timeout', '57014', 'query_timeout'],
    ['unmapped error', 'something else entirely', undefined, 'unknown'],
  ];

  it.each(categoryCases)(
    'categorizes a %s error as %s',
    async (_label: string, message: string, code: string | undefined, expectedCategory: DatabaseErrorCategory) => {
      const error = new Error(message);
      if (code !== undefined) {
        (error as Error & { code: string }).code = code;
      }
      const query = jest.fn().mockRejectedValue(error);
      const service = buildService(query);

      await expect(service.check()).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const logged = errorSpy.mock.calls[0]?.[0] as string;
      expect(logged).toContain(`category=${expectedCategory}`);
    },
  );

  it('does not use isInitialized as a liveness signal (regression test for CRITICAL #2)', async () => {
    // Garantiza que el service no inspecciona `isInitialized` para decidir
    // si la DB esta sana. Si alguien futuro restaura esa logica, este test
    // rompe: con `isInitialized: true` y `query` rechazando, la respuesta
    // debe ser 503, no 200.
    const query = jest.fn().mockRejectedValue(new Error('Connection lost'));
    const dataSource = {
      isInitialized: true,
      query,
    } as unknown as DataSource;
    const service = new HealthService(dataSource);

    await expect(service.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
