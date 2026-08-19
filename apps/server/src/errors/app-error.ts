/**
 * Error hierarchy for the API.
 *
 * The JS original swallowed every failure with `catch (err) { console.log(err) }`,
 * which left requests hanging until the client timed out. Everything here throws
 * a typed error instead; the central error middleware turns it into a response.
 */
export abstract class AppError extends Error {
  public abstract readonly statusCode: number;

  /** Stable machine-readable code for clients; never a localized string. */
  public abstract readonly code: string;

  public override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.cause = cause;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** Malformed input — failed validation, missing field, bad type. */
export class ValidationError extends AppError {
  public readonly statusCode = 400;
  public readonly code = 'VALIDATION_ERROR';

  /** Field-level detail, keyed by dotted path. */
  public readonly details: Record<string, string[]>;

  constructor(message: string, details: Record<string, string[]> = {}) {
    super(message);
    this.details = details;
  }
}

/** No credentials, or credentials that do not verify. */
export class UnauthorizedError extends AppError {
  public readonly statusCode = 401;
  public readonly code = 'UNAUTHORIZED';
}

/** Authenticated, but not allowed to do this — e.g. a non-admin editing a group. */
export class ForbiddenError extends AppError {
  public readonly statusCode = 403;
  public readonly code = 'FORBIDDEN';
}

export class NotFoundError extends AppError {
  public readonly statusCode = 404;
  public readonly code = 'NOT_FOUND';

  constructor(resource: string) {
    super(`${resource} not found`);
  }
}

/** State conflict — duplicate signup, reusing a spent reset link. */
export class ConflictError extends AppError {
  public readonly statusCode = 409;
  public readonly code = 'CONFLICT';
}

/** A dependency we do not control failed (S3, email, LLM backend). */
export class ExternalServiceError extends AppError {
  public readonly statusCode = 502;
  public readonly code = 'EXTERNAL_SERVICE_ERROR';

  public readonly service: string;

  constructor(service: string, message: string, cause?: unknown) {
    super(`${service}: ${message}`, cause);
    this.service = service;
  }
}

/** Narrows an `unknown` from a catch block without asserting past the type system. */
export function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return JSON.stringify(error);
}
