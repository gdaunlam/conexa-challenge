import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock };
  let mockRequest: { method: string; path: string; url: string; traceId?: string };
  let mockHost: ArgumentsHost;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  const buildMocks = (traceId?: string): void => {
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockRequest = { method: 'GET', path: '/movies', url: '/movies' };
    if (traceId !== undefined) {
      mockRequest.traceId = traceId;
    }
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
        getNext: () => undefined,
      }),
    } as unknown as ArgumentsHost;
  };

  beforeEach(() => {
    filter = new HttpExceptionFilter();

    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('normalizes an HttpException with a string message', () => {
    buildMocks();
    const exception = new HttpException('Resource not found', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        error: HttpStatus[HttpStatus.NOT_FOUND],
        message: 'Resource not found',
        details: null,
        traceId: expect.any(String),
        timestamp: expect.any(String),
      }),
    );
  });

  it('normalizes an HttpException with a structured object response (validation errors)', () => {
    buildMocks();
    const exception = new BadRequestException({
      error: 'Bad Request',
      message: 'Validation failed',
      details: [{ field: 'email', constraints: { isEmail: 'email must be a valid email' } }],
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Validation failed',
        details: [{ field: 'email', constraints: { isEmail: 'email must be a valid email' } }],
        traceId: expect.any(String),
        timestamp: expect.any(String),
      }),
    );
  });

  it('falls back to 500 Internal Server Error for non-HttpException errors', () => {
    buildMocks();
    filter.catch(new Error('boom'), mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'Internal server error',
        details: null,
      }),
    );
  });

  it('emits a valid UUID v4 traceId and an ISO 8601 UTC timestamp', () => {
    buildMocks();
    const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    const body = mockResponse.json.mock.calls[0]?.[0];
    expect(body).toBeDefined();
    expect(body.traceId).toMatch(UUID_V4_REGEX);
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('reuses the traceId set by TraceIdMiddleware instead of generating a new one', () => {
    const middlewareTraceId = '11111111-2222-4333-8444-555555555555';
    buildMocks(middlewareTraceId);
    const exception = new HttpException('Resource not found', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockHost);

    const body = mockResponse.json.mock.calls[0]?.[0];
    expect(body).toBeDefined();
    expect(body.traceId).toBe(middlewareTraceId);
  });

  it('falls back to a fresh UUID v4 when the middleware did not set a traceId', () => {
    buildMocks();
    const exception = new HttpException('Resource not found', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockHost);

    const body = mockResponse.json.mock.calls[0]?.[0];
    expect(body.traceId).toMatch(UUID_V4_REGEX);
  });

  it('logs the request path, not the full url (WARNING #1: avoid leaking query-string PII)', () => {
    buildMocks();
    mockRequest.url = '/movies?email=foo@example.com&token=hunter2&password=secret';
    mockRequest.path = '/movies';
    const exception = new HttpException('Validation failed', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = warnSpy.mock.calls[0]?.[0] as string;
    expect(logged).toContain('GET /movies ->');
    expect(logged).not.toContain('email=');
    expect(logged).not.toContain('token=');
    expect(logged).not.toContain('password=');
  });

  describe('log level: 4xx vs 5xx (WARNING #3: avoid contaminating ERROR channel)', () => {
    it('logs 400 Bad Request as warn (not error)', () => {
      buildMocks();
      filter.catch(new BadRequestException('Validation failed'), mockHost);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs 401 Unauthorized as warn (credential failures are expected, not server errors)', () => {
      buildMocks();
      filter.catch(new UnauthorizedException('Invalid credentials'), mockHost);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs 403 Forbidden as warn', () => {
      buildMocks();
      filter.catch(new ForbiddenException('Insufficient permissions'), mockHost);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs 404 Not Found as warn', () => {
      buildMocks();
      filter.catch(new NotFoundException('Resource not found'), mockHost);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs 500 Internal Server Error as error (genuine server-side failure)', () => {
      buildMocks();
      filter.catch(new Error('boom'), mockHost);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('logs 503 Service Unavailable as error (genuine server-side failure)', () => {
      buildMocks();
      filter.catch(new ServiceUnavailableException('Database connection not available'), mockHost);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
