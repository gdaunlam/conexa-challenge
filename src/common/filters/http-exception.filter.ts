import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RequestWithTraceId } from '../middleware/trace-id.middleware';

export interface ErrorDetail {
  field: string;
  constraints: Record<string, string>;
}

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  details: ErrorDetail[] | null;
  traceId: string;
  timestamp: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const traceId = this.resolveTraceId(request);
    const timestamp = new Date().toISOString();

    const { statusCode, error, message, details } = this.resolveBody(exception);

    const body: ErrorResponseBody = {
      statusCode,
      error,
      message,
      details,
      traceId,
      timestamp,
    };

    const logMessage = `[${traceId}] ${request.method} ${request.path} -> ${statusCode} ${error}: ${message}`;
    if (statusCode >= 500) {
      this.logger.error(logMessage);
    } else {
      this.logger.warn(logMessage);
    }

    response.status(statusCode).json(body);
  }

  private resolveTraceId(request: Request): string {
    const fromMiddleware = (request as Partial<RequestWithTraceId>).traceId;
    return typeof fromMiddleware === 'string' && fromMiddleware.length > 0
      ? fromMiddleware
      : randomUUID();
  }

  private resolveBody(exception: unknown): {
    statusCode: number;
    error: string;
    message: string;
    details: ErrorDetail[] | null;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const errorName = HttpStatus[statusCode] ?? 'Error';

      if (typeof exceptionResponse === 'string') {
        return {
          statusCode,
          error: errorName,
          message: exceptionResponse,
          details: null,
        };
      }

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        const rawMessage = responseObj['message'];
        const rawError = responseObj['error'];
        const rawDetails = responseObj['details'];

        const message =
          typeof rawMessage === 'string' && rawMessage.length > 0 ? rawMessage : exception.message;
        const error = typeof rawError === 'string' && rawError.length > 0 ? rawError : errorName;

        let details: ErrorDetail[] | null = null;
        if (Array.isArray(rawDetails)) {
          details = rawDetails.filter(this.isErrorDetail);
        } else if (Array.isArray(rawMessage)) {
          details = rawMessage
            .filter((item): item is string => typeof item === 'string')
            .map((item) => ({ field: item, constraints: {} }));
        }

        return { statusCode, error, message, details };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Internal server error',
      details: null,
    };
  }

  private isErrorDetail(value: unknown): value is ErrorDetail {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate['field'] === 'string' &&
      typeof candidate['constraints'] === 'object' &&
      candidate['constraints'] !== null
    );
  }
}
