import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 does not catch rejections from async handlers — an unhandled one
 * kills the process instead of returning a response. Wrapping routes here means
 * a handler can simply `throw` and the error middleware takes it from there.
 *
 * Handlers may be sync or async; both are normalized to a `void`-returning
 * `RequestHandler`, which is what Express actually expects. Registering an
 * `async` function directly is the mistake this exists to prevent.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => void | Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
