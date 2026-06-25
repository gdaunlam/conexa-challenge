import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { JwtTokenService } from '../service/jwt-token.service';

const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const authorization = this.extractAuthorization(request);
    if (authorization === null) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        message: 'Invalid credentials',
        details: null,
      });
    }

    const payload = this.jwtTokenService.verify(authorization);
    request.user = { id: payload.sub, role: payload.role };
    return true;
  }

  private extractAuthorization(request: Request): string | null {
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      return null;
    }
    const token = header.substring(BEARER_PREFIX.length).trim();
    if (token.length === 0) {
      return null;
    }
    return token;
  }
}
