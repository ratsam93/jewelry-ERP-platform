import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) ?? message;
        code = (resp.error as string) ?? code;
        if (Array.isArray(resp.message)) {
          details = { validationErrors: resp.message };
          message = 'Validation failed';
        }
      }
    } else if (exception instanceof Error) {
      // Never leak raw Prisma/SQL messages, and never leak internals in production.
      const isPrismaError = exception.name.startsWith('Prisma');
      const isProd = process.env.NODE_ENV === 'production';
      if (!isPrismaError && !isProd) {
        message = exception.message;
      }
    }

    // Map HTTP status to error codes
    if (status === 400) code = 'BAD_REQUEST';
    if (status === 401) code = 'UNAUTHORIZED';
    if (status === 403) code = 'FORBIDDEN';
    if (status === 404) code = 'NOT_FOUND';
    if (status === 409) code = 'CONFLICT';
    if (status === 429) code = 'RATE_LIMITED';

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      // Full details stay server-side only.
      console.error('Unhandled exception:', exception);
    }

    response.status(status).json({
      success: false,
      error: { code, message, details },
    });
  }
}
