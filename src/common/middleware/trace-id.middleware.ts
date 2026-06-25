import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export const TRACE_ID_HEADER = 'X-Trace-Id';

export interface RequestWithTraceId extends Request {
  traceId: string;
}

@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const traceId = randomUUID();
    (req as RequestWithTraceId).traceId = traceId;
    res.setHeader(TRACE_ID_HEADER, traceId);
    next();
  }
}
