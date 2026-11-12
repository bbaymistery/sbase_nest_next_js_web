import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { JwtPayload } from '@sbase/types';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPayload => {
  const request: any = ctx.switchToHttp().getRequest<Request>();
  return request['user'] as JwtPayload;
},
);
