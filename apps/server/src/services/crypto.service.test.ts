import { randomBytes } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret, maskSecret } from './crypto.service';

describe('crypto service', () => {
  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });

  it('round-trips a secret', () => {
    const secret = 'sk-super-secret-api-key-12345';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('produces a different ciphertext each time (fresh IV)', () => {
    const secret = 'same-input-both-times';
    expect(encryptSecret(secret)).not.toBe(encryptSecret(secret));
  });

  it('never stores the plaintext inside the encrypted payload', () => {
    const secret = 'obviously-identifiable-secret-value';
    expect(encryptSecret(secret)).not.toContain(secret);
  });

  it('detects tampering via the auth tag', () => {
    const encrypted = encryptSecret('a real api key');
    const parts = encrypted.split(':');
    // Flip the last character of the ciphertext segment.
    const tampered = [...parts];
    const ciphertext = tampered[2] ?? '';
    tampered[2] = ciphertext.slice(0, -1) + (ciphertext.endsWith('A') ? 'B' : 'A');

    expect(() => decryptSecret(tampered.join(':'))).toThrow();
  });

  it('rejects a malformed stored payload rather than crashing oddly', () => {
    expect(() => decryptSecret('not-a-valid-payload')).toThrow('malformed');
  });

  it('masks to only the last 4 characters', () => {
    expect(maskSecret('sk-abcdefgh1234')).toBe('••••1234');
  });
});
