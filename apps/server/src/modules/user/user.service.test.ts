import type { Sequelize } from 'sequelize';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { User } from '../../models/user';
import { createTestDatabase } from '../../test/db';
import { verifyAccessToken } from '../auth/token.service';
import { login, signUp } from './user.service';

const credentials = {
  name: 'Vishal',
  email: 'vishal@example.com',
  phone: '+491234567890',
  password: 'correct-horse-battery',
};

describe('user service', () => {
  let sequelize: Sequelize;

  beforeEach(async () => {
    sequelize = await createTestDatabase();
  });

  afterEach(async () => {
    await sequelize.close();
  });

  it('creates an account and returns a usable token', async () => {
    const result = await signUp(credentials);

    expect(result.user.email).toBe(credentials.email);
    expect(verifyAccessToken(result.token).sub).toBe(result.user.id);
  });

  it('stores the password as a hash, never in plain text', async () => {
    await signUp(credentials);

    const stored = await User.findOne({ where: { email: credentials.email } });
    expect(stored?.password).not.toBe(credentials.password);
    expect(stored?.password).toMatch(/^\$2[aby]\$/);
  });

  it('never exposes the password hash in the serialized user', async () => {
    const result = await signUp(credentials);

    expect(Object.keys(result.user)).toEqual(['id', 'name', 'email']);
  });

  it('rejects a duplicate signup with a conflict', async () => {
    await signUp(credentials);

    await expect(signUp(credentials)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
  });

  it('logs in with correct credentials', async () => {
    const created = await signUp(credentials);

    const result = await login({ email: credentials.email, password: credentials.password });

    expect(result.user.id).toBe(created.user.id);
  });

  it('gives the same error for an unknown email and a wrong password', async () => {
    // Distinguishable errors here would let anyone enumerate registered users.
    await signUp(credentials);

    const wrongPassword = await login({
      email: credentials.email,
      password: 'not-the-password',
    }).catch((error: unknown) => error);
    const unknownEmail = await login({
      email: 'nobody@example.com',
      password: credentials.password,
    }).catch((error: unknown) => error);

    expect(wrongPassword).toBeInstanceOf(Error);
    expect(unknownEmail).toBeInstanceOf(Error);
    expect((wrongPassword as Error).message).toBe((unknownEmail as Error).message);
    expect(wrongPassword).toMatchObject({ statusCode: 401 });
    expect(unknownEmail).toMatchObject({ statusCode: 401 });
  });
});
