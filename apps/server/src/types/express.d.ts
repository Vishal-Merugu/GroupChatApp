import type { User } from '../models/user';

/**
 * Typed `req.user` instead of the original's implicit global leak
 * (`userId = user.id` with no declaration, which wrote to globalThis).
 */
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
