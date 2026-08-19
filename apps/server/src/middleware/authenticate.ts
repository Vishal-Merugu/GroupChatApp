import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { UnauthorizedError } from '../errors/app-error';
import { User } from '../models/user';
import { extractBearerToken, verifyAccessToken } from '../modules/auth/token.service';
import { asyncHandler } from './async-handler';

/**
 * Verifies the token and loads the user onto the request.
 *
 * The original caught its own errors and called `console.log`, never calling
 * `next()` — an invalid token left the request hanging rather than returning
 * 401. Failures propagate to the error middleware now.
 */
async function authenticateRequest(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  const payload = verifyAccessToken(token);

  const user = await User.findByPk(payload.sub);
  if (!user) {
    // Token verifies but the account is gone — deleted since it was issued.
    throw new UnauthorizedError('Account no longer exists');
  }

  req.user = user;
  next();
}

/** Wrapped so a rejection reaches the error middleware rather than escaping. */
export const authenticate: RequestHandler = asyncHandler(authenticateRequest);

/** Narrows `req.user` for handlers mounted behind `authenticate`. */
export function requireUser(req: Request): User {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return req.user;
}
