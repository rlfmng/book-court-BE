export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'TENANT_NOT_FOUND'
  | 'TENANT_REQUIRED'
  | 'COURT_NOT_FOUND'
  | 'BOOKING_NOT_FOUND'
  | 'SLOT_UNAVAILABLE'
  | 'INVALID_SLOT'
  | 'BOOKING_NOT_CANCELLABLE'
  | 'INVALID_CREDENTIALS'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

/** Domain error rendered as `{ error: { code, message } }` by the error handler plugin. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: ErrorCode, message: string) => new AppError(400, code, message);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (code: ErrorCode, message: string) => new AppError(404, code, message);
export const conflict = (code: ErrorCode, message: string) => new AppError(409, code, message);

/** Postgres error codes we translate into clean API errors. */
export const PG_EXCLUSION_VIOLATION = '23P01';
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_CHECK_VIOLATION = '23514';

export function isPgError(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === code;
}
