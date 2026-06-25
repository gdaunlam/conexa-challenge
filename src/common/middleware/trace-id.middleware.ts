import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export const TRACE_ID_HEADER = 'X-Trace-Id';

export interface RequestWithTraceId extends Request {
  traceId: string;
}

/**
 * Middleware global que asigna un `traceId` (UUID v4) unico por request.
 * - Lo guarda en `req.traceId` para que el `HttpExceptionFilter` lo reuse
 *   en el body de error y en los logs (un mismo traceId para una misma request,
 *   incluso si se loguea desde varios lugares).
 * - Lo expone en la response como header `X-Trace-Id` para que clientes y
 *   balanceadores puedan correlacionar logs.
 *
 * DOCS/ENDPOINTS.md seccion 6 define este contrato: `traceId` es un UUID v4
 * generado por middleware, no por el filter.
 */
@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const traceId = randomUUID();
    (req as RequestWithTraceId).traceId = traceId;
    res.setHeader(TRACE_ID_HEADER, traceId);
    next();
  }
}
