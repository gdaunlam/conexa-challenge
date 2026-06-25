import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user;
  },
);
