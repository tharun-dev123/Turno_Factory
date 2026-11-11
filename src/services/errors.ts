/** Typed errors thrown by the service layer. The UI maps these to operator-facing messages. */

export type ServiceErrorCode =
  | 'DUPLICATE_BARCODE'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'AUTH'
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
  constructor(message = 'Invalid username or password.') {
    super('AUTH', message);
  }
}

export class NetworkError extends ServiceError {
  constructor(message = 'Cannot reach the server. Check your connection and try again.') {
    super('NETWORK', message);
  }
}

/** Convert any thrown value into an operator-facing message. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ServiceError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
