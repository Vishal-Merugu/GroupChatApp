import type * as EnvModule from '../../config/env';
import type { Sequelize } from 'sequelize';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocked so this file can exercise a broken server-wide default (LLM_PROVIDER
// set to a hosted provider with no API key) without disturbing the shared
// ollama-default env every other test file relies on via setup-env.ts.
vi.mock('../../config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return {
    ...actual,
    getEnv: () => ({
      ...actual.loadEnv(process.env),
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: undefined,
      LLM_API_KEY: undefined,
    }),
  };
});

const { User } = await import('../../models/user');
const { createTestDatabase } = await import('../../test/db');
const { getProviderChainForUser } = await import('./llm-credential.service');

describe('getProviderChainForUser — server default is broken', () => {
  let sequelize: Sequelize;

  beforeEach(async () => {
    sequelize = await createTestDatabase();
  });

  afterEach(async () => {
    await sequelize.close();
    vi.restoreAllMocks();
  });

  it('still throws "No AI providers configured" when both the user and the operator have nothing usable', async () => {
    const user = await User.create({
      name: 'Nobody',
      email: 'nobody@example.com',
      phone: '+491234567890',
      password: 'hashed',
    });

    // A misconfigured server default (openai-compatible with no key) must not
    // masquerade as a working provider — it's swallowed, not surfaced as a
    // crash, and the user still gets the clear "add a key" message.
    await expect(getProviderChainForUser(user.id)).rejects.toThrow(
      'No AI providers configured',
    );
  });
});
