export const APPLICATION_ERROR_KINDS = [
  "validation",
  "unauthorized",
  "forbidden",
  "not-found",
  "conflict",
  "rate-limited",
  "unavailable",
  "unknown",
] as const;

export type ApplicationErrorKind = (typeof APPLICATION_ERROR_KINDS)[number];

export interface ApplicationErrorOptions {
  status?: number;
  code?: string;
  retryAfterSeconds?: number;
  requestId?: string;
  cause?: unknown;
}

export class ApplicationError extends Error {
  readonly kind: ApplicationErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly retryAfterSeconds?: number;
  readonly requestId?: string;

  constructor(
    kind: ApplicationErrorKind,
    message: string,
    options: ApplicationErrorOptions = {},
  ) {
    if (options.cause === undefined) super(message);
    else super(message, { cause: options.cause });
    this.name = "ApplicationError";
    this.kind = kind;
    if (options.status !== undefined) this.status = options.status;
    if (options.code !== undefined) this.code = options.code;
    if (options.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
    if (options.requestId !== undefined) this.requestId = options.requestId;
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}

export function validationError(message: string, cause?: unknown) {
  return cause === undefined
    ? new ApplicationError("validation", message)
    : new ApplicationError("validation", message, { cause });
}
