import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';

import { getEnv } from '../../config/env';
import { UnauthorizedError } from '../../errors/app-error';

/**
 * A decoded token is untrusted input — anyone can post a string to the
 * `Authorization` header — so the payload is validated, not cast (Decision 8).
 */
const tokenPayloadSchema = z.object({
  sub: z.coerce.number().int().positive(),
  name: z.string(),
});

export type TokenPayload = z.infer<typeof tokenPayloadSchema>;

export function signAccessToken(user: { id: number; name: string }): string {
  const env = getEnv();
  // The original signed tokens with no expiry at all, so a leaked token was
  // valid forever.
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign({ sub: user.id, name: user.name }, env.JWT_SECRET_KEY, options);
}

export function verifyAccessToken(token: string): TokenPayload {
  const env = getEnv();

  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET_KEY);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Session expired, please log in again');
    }
    throw new UnauthorizedError('Invalid authentication token');
  }

  const parsed = tokenPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new UnauthorizedError('Malformed authentication token');
  }
  return parsed.data;
}

/** Accepts `Bearer <token>` and a bare token, since the old client sent bare. */
export function extractBearerToken(header: string | undefined): string {
  if (!header) {
    throw new UnauthorizedError('Missing authentication token');
  }
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1] ?? header;
  if (!token.trim()) {
    throw new UnauthorizedError('Missing authentication token');
  }
  return token.trim();
}
