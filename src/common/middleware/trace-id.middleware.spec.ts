import { NextFunction, Request, Response } from 'express';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import { TRACE_ID_HEADER, TraceIdMiddleware } from './trace-id.middleware';

describe('TraceIdMiddleware', () => {
  let middleware: TraceIdMiddleware;
  let mockRequest: Request & { traceId?: string };
  let mockResponse: { setHeader: jest.Mock };
  let nextMock: NextFunction;

  const buildMocks = (): void => {
    mockRequest = {} as Request & { traceId?: string };
    mockResponse = { setHeader: jest.fn() };
    nextMock = jest.fn();
  };

  beforeEach(() => {
    middleware = new TraceIdMiddleware();
    buildMocks();
  });

  it('assigns a UUID v4 traceId to the request', () => {
    middleware.use(mockRequest, mockResponse as unknown as Response, nextMock);

    expect(mockRequest.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('writes the traceId into the X-Trace-Id response header', () => {
    middleware.use(mockRequest, mockResponse as unknown as Response, nextMock);

    expect(mockResponse.setHeader).toHaveBeenCalledWith(TRACE_ID_HEADER, mockRequest.traceId);
  });

  it('invokes next() exactly once', () => {
    middleware.use(mockRequest, mockResponse as unknown as Response, nextMock);

    expect(nextMock).toHaveBeenCalledTimes(1);
  });

  it('generates a fresh UUID on every request (no memoization across calls)', () => {
    middleware.use(mockRequest, mockResponse as unknown as Response, nextMock);
    const firstTraceId = mockRequest.traceId;

    buildMocks();
    middleware.use(mockRequest, mockResponse as unknown as Response, nextMock);
    const secondTraceId = mockRequest.traceId;

    expect(firstTraceId).not.toBe(secondTraceId);
  });

  it('produces a traceId that HttpExceptionFilter can read back as-is (B4: end-to-end correlation)', () => {
    // B4: el contrato de DOCS/ENDPOINTS.md seccion 6 es que un mismo request
    // tiene un unico traceId visible en el response header Y en el body del
    // error. Esto prueba el "puente" entre las dos piezas sin levantar Nest:
    // el middleware setea el header + req.traceId, el filter lee req.traceId
    // y lo emite en el body. Si alguien futuro rompe el contrato (e.g. el
    // filter empieza a generar uno nuevo en vez de reusar), este test rompe.
    middleware.use(mockRequest, mockResponse as unknown as Response, nextMock);

    const setHeaderCall = mockResponse.setHeader.mock.calls.find(
      ([name]) => name === TRACE_ID_HEADER,
    );
    const headerTraceId = setHeaderCall?.[1] as string;
    expect(mockRequest.traceId).toBe(headerTraceId);

    // Reusar el traceId del middleware como input del filter (mismo shape que
    // un request real) y verificar que el body del error lo contiene verbatim.
    const filter = new HttpExceptionFilter();
    const filterRequest = { ...mockRequest, method: 'GET', path: '/movies', url: '/movies' };
    const filterResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => filterResponse,
        getRequest: () => filterRequest,
        getNext: () => undefined,
      }),
    };

    filter.catch(new Error('boom'), host as never);

    const body = filterResponse.json.mock.calls[0]?.[0] as { traceId: string };
    expect(body.traceId).toBe(headerTraceId);
  });
});
