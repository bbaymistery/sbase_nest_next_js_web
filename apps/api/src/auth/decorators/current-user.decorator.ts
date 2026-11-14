import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@sbase/types';
import type { AuthenticatedRequest } from '../guards/jwt-auth.guard.js';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPayload => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user;
},
);
