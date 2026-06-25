import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtTokenService, JwtPayload } from '../service/jwt-token.service';

const buildContext = (
  request: { headers?: Record<string, string>; user?: unknown } = {},
): { context: ExecutionContext; request: Record<string, unknown> } => {
  const req: Record<string, unknown> = { headers: request.headers ?? {}, ...request };
  const context = {
    getHandler: () => handlerStub,
    getClass: () => classStub,
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
  return { context, request: req };
};

const handlerStub = () => undefined;
const classStub = class {};

describe('JwtAuthGuard', () => {
  let verify: jest.Mock;

  const buildGuard = (publicMetadata: unknown = false): JwtAuthGuard => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(publicMetadata),
    } as unknown as Reflector;
    verify = jest.fn().mockReturnValue({ sub: '42', role: 'user' } satisfies JwtPayload);
    const jwtTokenService = { verify } as unknown as JwtTokenService;
    return new JwtAuthGuard(reflector, jwtTokenService);
  };

  it('skips JWT validation when the handler has @Public()', () => {
    const guard = buildGuard(true);
    const { context } = buildContext();

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('reads the @Public() metadata from both the handler and the class (Reflector convention)', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector, { verify: jest.fn() } as unknown as JwtTokenService);

    const { context } = buildContext();
    guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      handlerStub,
      classStub,
    ]);
  });

  it('throws 401 when the Authorization header is missing', () => {
    const guard = buildGuard();
    const { context } = buildContext({});

    try {
      guard.canActivate(context);
      throw new Error('expected rejection');
    } catch (caught) {
      expect(caught).toBeInstanceOf(UnauthorizedException);
      const exception = caught as UnauthorizedException;
      expect(exception.getStatus()).toBe(401);
      const response = exception.getResponse() as Record<string, unknown>;

      expect(response).toMatchObject({
        error: 'Unauthorized',
        message: 'Invalid credentials',
        details: null,
      });
      expect(JSON.stringify(response)).not.toContain('JWT');
      expect(JSON.stringify(response)).not.toContain('token');
    }
  });

  it('throws 401 when the Authorization header does not start with "Bearer "', () => {
    const guard = buildGuard();
    const { context } = buildContext({ headers: { authorization: 'Basic abc123' } });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('throws 401 when the Bearer token is empty (rejects early without calling verify)', () => {
    const guard = buildGuard();
    const { context } = buildContext({ headers: { authorization: 'Bearer ' } });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });

  it('throws 401 when the JwtTokenService rejects the token (expired or invalid)', () => {
    verify = jest.fn().mockImplementation(() => {
      throw new UnauthorizedException('Invalid credentials');
    });
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector, { verify } as unknown as JwtTokenService);
    const { context } = buildContext({ headers: { authorization: 'Bearer bad.jwt' } });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('sets req.user to { id, role } when the token is valid (for downstream handlers)', () => {
    verify = jest.fn().mockReturnValue({ sub: '42', role: 'admin' });
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector, { verify } as unknown as JwtTokenService);
    const { context, request } = buildContext({ headers: { authorization: 'Bearer good.jwt' } });

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({ id: '42', role: 'admin' });
    expect(verify).toHaveBeenCalledWith('good.jwt');
  });

  it('does not set req.user when the handler is @Public() (no auth ran)', () => {
    const guard = buildGuard(true);
    const { context, request } = buildContext({ headers: {} });

    guard.canActivate(context);

    expect(request.user).toBeUndefined();
  });
});
