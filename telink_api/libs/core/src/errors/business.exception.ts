import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }
}

export const BizErr = {
  NotFound: (what: string) =>
    new BusinessException('NOT_FOUND', `${what} not found`, HttpStatus.NOT_FOUND),
  Unauthorized: (msg = 'Unauthorized') =>
    new BusinessException('UNAUTHORIZED', msg, HttpStatus.UNAUTHORIZED),
  Forbidden: (msg = 'Forbidden') =>
    new BusinessException('FORBIDDEN', msg, HttpStatus.FORBIDDEN),
  Conflict: (msg: string) =>
    new BusinessException('CONFLICT', msg, HttpStatus.CONFLICT),
  BadRequest: (msg: string) =>
    new BusinessException('BAD_REQUEST', msg, HttpStatus.BAD_REQUEST),
  TooManyRequests: (msg = 'Too many requests') =>
    new BusinessException('RATE_LIMITED', msg, HttpStatus.TOO_MANY_REQUESTS),
  Locked: (retryAfterSec: number) =>
    new BusinessException(
      'ACCOUNT_LOCKED',
      `Account temporarily locked after too many failed attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
      HttpStatus.TOO_MANY_REQUESTS,
      { retryAfterSec },
    ),
};