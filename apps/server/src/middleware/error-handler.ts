import { LlmError } from '@groupchat/llm';
import type { NextFunction, Request, Response } from 'express';
import { ValidationError as SequelizeValidationError, UniqueConstraintError } from 'sequelize';
import { ZodError } from 'zod';

import {
  AppError,
  ConflictError,
  ExternalServiceError,
  ValidationError,
  errorToString,
} from '../errors/app-error';
import { logger } from '../utils/logger';

interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, string[]> };
}

/**
 * The single place an error becomes a response. Everything upstream throws.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    // Streaming already started — Express must close the connection itself.
    next(error);
    return;
  }

  const normalized = normalize(error);

  const logContext = {
    method: req.method,
    path: req.path,
    statusCode: normalized.statusCode,
    code: normalized.code,
    userId: req.user?.id,
  };

  // 5xx is our bug; 4xx is the caller's. Only the former deserves an alarm.
  if (normalized.statusCode >= 500) {
    logger.error(normalized.message, { ...logContext, stack: normalized.stack });
  } else {
    logger.warn(normalized.message, logContext);
  }

  const body: ErrorBody = {
    error: {
      code: normalized.code,
      // Never leak an internal message to the client on a 500.
      message:
        normalized.statusCode >= 500 ? 'An unexpected error occurred' : normalized.message,
    },
  };
  if (normalized instanceof ValidationError && Object.keys(normalized.details).length > 0) {
    body.error.details = normalized.details;
  }

  res.status(normalized.statusCode).json(body);
}

function normalize(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || '_';
      (details[key] ??= []).push(issue.message);
    }
    return new ValidationError('Request validation failed', details);
  }

  if (error instanceof UniqueConstraintError) {
    return new ConflictError('That value is already taken');
  }

  if (error instanceof SequelizeValidationError) {
    const details: Record<string, string[]> = {};
    for (const item of error.errors) {
      const key = item.path ?? '_';
      (details[key] ??= []).push(item.message);
    }
    return new ValidationError('Request validation failed', details);
  }

  if (error instanceof LlmError) {
    // A provider being rate-limited, unreachable, or misconfigured is an
    // upstream failure, not a bug in this server — 502, not 500. `FallbackProvider`
    // has already tried every configured credential by the time this surfaces.
    return new ExternalServiceError(error.provider, error.message, error);
  }

  return new InternalError(errorToString(error), error);
}

class InternalError extends AppError {
  public readonly statusCode = 500;
  public readonly code = 'INTERNAL_ERROR';
}

/** Terminal 404 for unmatched API routes. */
export function notFoundHandler(req: Request, res: Response): void {
  // `originalUrl`, not `path` — this is mounted under /api, and `path` is
  // relative to the mount point, so it would report "/nope" for "/api/nope".
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Cannot ${req.method} ${req.originalUrl}` },
  });
}
