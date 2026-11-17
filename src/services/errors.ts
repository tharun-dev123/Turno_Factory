/** Typed errors thrown by the service layer. The UI maps these to operator-facing messages. */

export type ServiceErrorCode =
  | 'DUPLICATE_BARCODE'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'AUTH'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'BUSY'
  | 'INTERNAL'
  | 'NETWORK'
  | 'UNKNOWN';

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class DuplicateBarcodeError extends ServiceError {
  readonly existingSerialNumber: number | null;
  readonly existingCellId: string | null;

  constructor(barcode: string, existing?: { id: string; serialNumber: number }) {
    super('DUPLICATE_BARCODE', `Battery barcode ${barcode} is already registered.`);
    this.existingSerialNumber = existing?.serialNumber ?? null;
    this.existingCellId = existing?.id ?? null;
  }
}

export class ValidationError extends ServiceError {
  /** Field name -> message */
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super('VALIDATION', message);
    this.fieldErrors = fieldErrors;
  }
}

export class NotFoundError extends ServiceError {
  constructor(message = 'Cell not found. It may have been deleted.') {
    super('NOT_FOUND', message);
  }
}

export class AuthError extends ServiceError {
  /** Backend reason, e.g. INVALID_CREDENTIALS, LOCKED_OUT, TOKEN_EXPIRED, TOKEN_INVALID */
  readonly reason: string | null;

  constructor(message = 'Invalid username or password.', reason: string | null = null) {
    super('AUTH', message);
    this.reason = reason;
  }
}

/** The signed-in account is read-only (Viewer) and tried to change data. Nothing was changed. */
export class ForbiddenError extends ServiceError {
  constructor(message = 'Your account has read-only access and cannot make changes.') {
    super('FORBIDDEN', message);
  }
}

/** The cell was changed by someone else after it was loaded (optimistic locking). */
export class ConflictError extends ServiceError {
  constructor(message = 'This cell was changed by someone else. Go back, reopen it and try again.') {
    super('CONFLICT', message);
  }
}

/** The shared backend is handling another request. Safe to retry. */
export class BusyError extends ServiceError {
  constructor(message = 'The server is busy. Please try again in a moment.') {
    super('BUSY', message);
  }
}

/** The backend failed. When `recovery` is ROLLED_BACK nothing was saved. */
export class InternalError extends ServiceError {
  readonly recovery: string | null;

  constructor(message = 'The server could not complete the request. Please try again.', recovery: string | null = null) {
    super('INTERNAL', message);
    this.recovery = recovery;
  }
}

/** The request could not be completed or its outcome is unknown (offline, timeout, bad response). */
export class NetworkError extends ServiceError {
  constructor(message = 'Cannot reach the server. Check your connection and try again.') {
    super('NETWORK', message);
  }
}

/** No response arrived in time: the server may or may not have processed the request. */
export class TimeoutError extends NetworkError {
  constructor(message = 'The server took too long to respond. The request was not confirmed. Please try again.') {
    super(message);
  }
}

/** Errors that mean "outcome unknown or temporary": a retry with the same requestId is safe. */
export function isTransientError(error: unknown): boolean {
  return error instanceof NetworkError || error instanceof BusyError || error instanceof InternalError;
}

/** Convert any thrown value into an operator-facing message. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ServiceError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
