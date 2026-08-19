import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { getEnv } from '../config/env';
import { ExternalServiceError } from '../errors/app-error';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

let cachedKey: Buffer | undefined;

function getKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }
  const key = Buffer.from(getEnv().CREDENTIAL_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    // Caught at startup by the env schema's length check on the base64 string;
    // this is a second guard in case the encoding was wrong rather than the length.
    throw new ExternalServiceError('crypto', 'CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes');
  }
  cachedKey = key;
  return key;
}

/**
 * Encrypts a secret (an API key) for storage.
 *
 * AES-256-GCM: a fresh random IV per call, and the auth tag travels with the
 * ciphertext so tampering with a stored row is detected on decrypt rather than
 * silently producing garbage. Output is one string — `iv:authTag:ciphertext`,
 * each base64 — so it fits a single TEXT column without a second migration.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(
    ':',
  );
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new ExternalServiceError('crypto', 'stored secret is malformed');
  }
  const [ivPart, authTagPart, ciphertextPart] = parts;

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivPart ?? '', 'base64'));
  decipher.setAuthTag(Buffer.from(authTagPart ?? '', 'base64'));

  try {
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart ?? '', 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch (error) {
    // GCM auth-tag mismatch — the row was tampered with or the key rotated.
    throw new ExternalServiceError('crypto', 'stored secret failed integrity check', error);
  }
}

/** Last 4 characters only, for display. Never enough to reconstruct the key. */
export function maskSecret(plaintext: string): string {
  const tail = plaintext.slice(-4);
  return `••••${tail}`;
}
