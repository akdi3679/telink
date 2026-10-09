import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessException } from './business.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const { status, body } = this.normalize(exception, request);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}: ${body.message}`,
        (exception as Error)?.stack,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} → ${status}: ${body.message}`,
      );
    }

    response.status(status).json(body);
  }

  private normalize(
    exception: unknown,
    request: { url?: string },
  ): { status: number; body: Record<string, unknown> } {
    if (exception instanceof BusinessException) {
      return {
        status: exception.getStatus(),
        body: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
          path: request?.url,
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const payload =
        typeof res === 'string' ? { message: res } : (res as Record<string, unknown>);
      return {
        status,
        body: {
          code: this.codeForStatus(status),
          message: (payload['message'] as string) ?? exception.message,
          path: request?.url,
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: 'UNIQUE_VIOLATION',
            message: 'A record with this value already exists',
            path: request?.url,
          },
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          body: {
            code: 'NOT_FOUND',
            message: 'Record not found',
            path: request?.url,
          },
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        path: request?.url,
      },
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case 400: return 'BAD_REQUEST';
      case 401: return 'UNAUTHORIZED';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 422: return 'VALIDATION_ERROR';
      case 429: return 'RATE_LIMITED';
      case 500: return 'INTERNAL_ERROR';
      default: return 'ERROR';
    }
  }
}