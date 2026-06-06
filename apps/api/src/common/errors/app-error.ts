import { ERROR_CODES, type ErrorCode } from "@construction-erp/shared";

/**
 * Base class for all expected failures. See docs/errors.md.
 * `message` is user-facing and must be friendly + actionable.
 * `expose` is true for errors whose message is safe to return to the client.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly expose: boolean;

  constructor(params: {
    code: ErrorCode;
    message: string;
    status: number;
    details?: Record<string, unknown>;
    expose?: boolean;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = new.target.name;
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
    this.expose = params.expose ?? true;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Please check the submitted data.", details?: Record<string, unknown>) {
    super({ code: ERROR_CODES.VALIDATION_ERROR, message, status: 400, details });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super({ code: ERROR_CODES.AUTHENTICATION_REQUIRED, message, status: 401 });
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super({ code: ERROR_CODES.PERMISSION_DENIED, message, status: 403 });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.") {
    super({ code: ERROR_CODES.NOT_FOUND, message, status: 404 });
  }
}

export class ConflictError extends AppError {
  constructor(message = "This action conflicts with the current state. Please refresh.") {
    super({ code: ERROR_CODES.CONFLICT, message, status: 409 });
  }
}

export class IdempotencyError extends AppError {
  constructor(message = "This request was already submitted. Please refresh the page.") {
    super({ code: ERROR_CODES.IDEMPOTENCY_CONFLICT, message, status: 409 });
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many attempts. Please try again after a few minutes.") {
    super({ code: ERROR_CODES.RATE_LIMITED, message, status: 429 });
  }
}

export class UploadError extends AppError {
  constructor(
    message = "The file could not be uploaded. Please try again.",
    code: ErrorCode = ERROR_CODES.UPLOAD_FAILED,
  ) {
    super({ code, message, status: 400 });
  }
}

export class DatabaseError extends AppError {
  constructor(cause?: unknown) {
    super({
      code: ERROR_CODES.DATABASE_ERROR,
      message: "Something went wrong while saving. Please try again.",
      status: 500,
      expose: false,
      cause,
    });
  }
}
