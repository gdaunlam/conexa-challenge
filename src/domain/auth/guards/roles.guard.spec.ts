import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { UserRole } from '../enums/user-role.enum';
import { RolesGuard } from './roles.guard';

const buildContext = (user?: AuthenticatedUser): ExecutionContext => {
  const req = { user };
  return {
    getHandler: () => handlerStub,
    getClass: () => classStub,
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
};

const handlerStub = () => undefined;
const classStub = class {};

describe('RolesGuard', () => {
  const buildGuard = (metadata: UserRole[] | undefined): RolesGuard => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(metadata),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  it('reads the @Roles() metadata from both the handler and the class', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['admin']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    guard.canActivate(buildContext({ id: '1', role: 'admin' }));

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [handlerStub, classStub]);
  });

  it('lets any authenticated user pass when the handler has no @Roles()', () => {
    const guard = buildGuard(undefined);
    const context = buildContext({ id: '1', role: 'user' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('lets any authenticated user pass when @Roles() is an empty array', () => {
    const guard = buildGuard([]);
    const context = buildContext({ id: '1', role: 'user' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when the user role is in the allowed list', () => {
    const guard = buildGuard(['admin']);
    const context = buildContext({ id: '1', role: 'admin' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when the user matches one of multiple allowed roles', () => {
    const guard = buildGuard(['admin', 'user']);
    const context = buildContext({ id: '1', role: 'user' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws 403 (not 401) when the user role does not match', () => {
    const guard = buildGuard(['admin']);
    const context = buildContext({ id: '1', role: 'user' });

    try {
      guard.canActivate(context);
      throw new Error('expected rejection');
    } catch (caught) {
      expect(caught).toBeInstanceOf(ForbiddenException);
      const exception = caught as ForbiddenException;
      expect(exception.getStatus()).toBe(403);
      const response = exception.getResponse() as Record<string, unknown>;
      expect(response).toMatchObject({
        error: 'Forbidden',
        message: 'Insufficient permissions',
        details: null,
      });
    }
  });

  it('throws 403 when req.user is missing (defensive: indicates JwtAuthGuard was bypassed)', () => {
    const guard = buildGuard(['admin']);
    const context = buildContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
