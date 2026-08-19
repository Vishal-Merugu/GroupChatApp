import type { Sequelize } from 'sequelize';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { User } from '../../models/user';
import { createTestDatabase } from '../../test/db';
import * as urlSafety from '../../utils/url-safety';
import {
  createCredential,
  deleteCredential,
  getProviderChainForUser,
  listCredentials,
  reorderCredentials,
  testCredential,
  updateCredential,
} from './llm-credential.service';

async function makeUser(name: string): Promise<User> {
  return User.create({
    name,
    email: `${name.toLowerCase()}@example.com`,
    phone: '+491234567890',
    password: 'hashed',
  });
}

describe('llm-credential service', () => {
  let sequelize: Sequelize;
  let alice: User;
  let bob: User;

  beforeEach(async () => {
    sequelize = await createTestDatabase();
    alice = await makeUser('Alice');
    bob = await makeUser('Bob');
    // Base-URL validation does a real DNS lookup; stub it out for tests that
    // don't care about SSRF behaviour specifically.
    vi.spyOn(urlSafety, 'assertPublicHttpsUrl').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await sequelize.close();
  });

  it('creates a credential and masks the key, never returning it raw', async () => {
    const credential = await createCredential(alice.id, {
      provider: 'groq',
      label: 'My Groq key',
      model: 'llama-3.3-70b-versatile',
      apiKey: 'gsk_abcdefghijklmnop1234',
    });

    expect(credential.maskedApiKey).toBe('••••1234');
    expect(JSON.stringify(credential)).not.toContain('gsk_abcdefghijklmnop1234');
  });

  it('assigns the next priority automatically', async () => {
    const first = await createCredential(alice.id, {
      provider: 'groq',
      label: 'First',
      model: 'llama3',
      apiKey: 'gsk_first',
    });
    const second = await createCredential(alice.id, {
      provider: 'openrouter',
      label: 'Second',
      model: 'some/model:free',
      apiKey: 'or_second',
    });

    expect(first.priority).toBe(0);
    expect(second.priority).toBe(1);
  });

  it('lists only the calling user\'s credentials, ordered by priority', async () => {
    await createCredential(alice.id, {
      provider: 'groq',
      label: 'Alice key',
      model: 'llama3',
      apiKey: 'gsk_alice',
    });
    await createCredential(bob.id, {
      provider: 'groq',
      label: 'Bob key',
      model: 'llama3',
      apiKey: 'gsk_bob',
    });

    const aliceCredentials = await listCredentials(alice.id);
    expect(aliceCredentials).toHaveLength(1);
    expect(aliceCredentials[0]?.label).toBe('Alice key');
  });

  it('lets ollama credentials skip the API key entirely', async () => {
    const credential = await createCredential(alice.id, {
      provider: 'ollama',
      label: 'Local',
      model: 'llama3.1',
    });

    expect(credential.maskedApiKey).toBeNull();
  });

  it('rejects a custom base URL for ollama — it always uses the server\'s local instance', async () => {
    // Ollama's client does not enforce HTTPS (localhost:11434 is the normal
    // case), so accepting a user-suppliable baseUrl for it would let the SSRF
    // guard be routed around entirely via this one provider kind.
    await expect(
      createCredential(alice.id, {
        provider: 'ollama',
        label: 'Sneaky ollama',
        model: 'llama3.1',
        baseUrl: 'http://169.254.169.254/',
      }),
    ).rejects.toThrow('does not accept a custom base URL');
  });

  it('rejects attaching a base URL to an existing ollama credential via update', async () => {
    const credential = await createCredential(alice.id, {
      provider: 'ollama',
      label: 'Local',
      model: 'llama3.1',
    });

    await expect(
      updateCredential(alice.id, credential.id, { baseUrl: 'http://169.254.169.254/' }),
    ).rejects.toThrow('does not accept a custom base URL');
  });

  it('rejects a hosted provider with no API key', async () => {
    await expect(
      createCredential(alice.id, { provider: 'groq', label: 'No key', model: 'llama3' }),
    ).rejects.toThrow();
  });

  it('validates the base URL for SSRF before persisting', async () => {
    const spy = vi.mocked(urlSafety.assertPublicHttpsUrl).mockRejectedValue(new Error('blocked'));

    await expect(
      createCredential(alice.id, {
        provider: 'custom',
        label: 'Custom',
        model: 'anything',
        apiKey: 'x',
        baseUrl: 'https://169.254.169.254/',
      }),
    ).rejects.toThrow('blocked');

    expect(spy).toHaveBeenCalledWith('https://169.254.169.254/');
  });

  it('refuses to update a credential owned by another user', async () => {
    const bobsCredential = await createCredential(bob.id, {
      provider: 'groq',
      label: "Bob's key",
      model: 'llama3',
      apiKey: 'gsk_bob',
    });

    await expect(
      updateCredential(alice.id, bobsCredential.id, { label: 'Hijacked' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses to delete a credential owned by another user', async () => {
    const bobsCredential = await createCredential(bob.id, {
      provider: 'groq',
      label: "Bob's key",
      model: 'llama3',
      apiKey: 'gsk_bob',
    });

    await expect(deleteCredential(alice.id, bobsCredential.id)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(await listCredentials(bob.id)).toHaveLength(1);
  });

  it('rotates the key on update without needing it resupplied elsewhere', async () => {
    const credential = await createCredential(alice.id, {
      provider: 'groq',
      label: 'Key',
      model: 'llama3',
      apiKey: 'gsk_old1234',
    });

    const updated = await updateCredential(alice.id, credential.id, { apiKey: 'gsk_new5678' });

    expect(updated.maskedApiKey).toBe('••••5678');
  });

  it('reorders credentials and persists the new priority', async () => {
    const a = await createCredential(alice.id, {
      provider: 'groq',
      label: 'A',
      model: 'm',
      apiKey: 'k1',
    });
    const b = await createCredential(alice.id, {
      provider: 'openrouter',
      label: 'B',
      model: 'm',
      apiKey: 'k2',
    });

    const reordered = await reorderCredentials(alice.id, [b.id, a.id]);

    expect(reordered.map((c) => c.label)).toEqual(['B', 'A']);
    expect(reordered.map((c) => c.priority)).toEqual([0, 1]);
  });

  it('rejects a reorder that omits or duplicates a credential', async () => {
    const a = await createCredential(alice.id, {
      provider: 'groq',
      label: 'A',
      model: 'm',
      apiKey: 'k1',
    });

    await expect(reorderCredentials(alice.id, [a.id, a.id])).rejects.toThrow();
    await expect(reorderCredentials(alice.id, [])).rejects.toThrow();
  });

  it('rejects reordering a credential that belongs to someone else', async () => {
    const bobsCredential = await createCredential(bob.id, {
      provider: 'groq',
      label: "Bob's",
      model: 'm',
      apiKey: 'k',
    });

    await expect(reorderCredentials(alice.id, [bobsCredential.id])).rejects.toThrow();
  });

  it('falls back to the server\'s own default when the user has no credentials', async () => {
    // Falls through to the operator's LLM_PROVIDER default (ollama, by default
    // in tests) rather than hard-blocking a brand-new user with nothing set up.
    const chain = await getProviderChainForUser(alice.id);
    expect(chain.name).toBe('ollama');
  });

  it('excludes disabled credentials, falling back to the server default', async () => {
    const credential = await createCredential(alice.id, {
      provider: 'groq',
      label: 'Disabled',
      model: 'llama3',
      apiKey: 'gsk_x',
    });
    await updateCredential(alice.id, credential.id, { enabled: false });

    const chain = await getProviderChainForUser(alice.id);
    expect(chain.name).toBe('ollama');
  });

  it('tries the user\'s own credentials before falling through to the server default', async () => {
    await createCredential(alice.id, {
      provider: 'groq',
      label: 'Mine',
      model: 'llama3',
      apiKey: 'gsk_mine',
    });

    const chain = await getProviderChainForUser(alice.id);
    // groq (the user's own) first, ollama (the server default) last.
    expect(chain.name).toBe('fallback(groq -> ollama)');
  });

  it('builds a chain from enabled credentials in priority order', async () => {
    await createCredential(alice.id, {
      provider: 'groq',
      label: 'First',
      model: 'llama3',
      apiKey: 'gsk_first',
    });
    await createCredential(alice.id, {
      provider: 'openrouter',
      label: 'Second',
      model: 'm/free',
      apiKey: 'or_second',
    });

    const chain = await getProviderChainForUser(alice.id);
    // The user's two credentials, then the server default last.
    expect(chain.name).toBe('fallback(fallback(groq -> openrouter) -> ollama)');
  });

  it('reports a friendly failure when a test call cannot reach the provider', async () => {
    const credential = await createCredential(alice.id, {
      provider: 'custom',
      label: 'Unreachable',
      model: 'm',
      apiKey: 'k',
      baseUrl: 'https://localhost:1/v1',
    });

    const result = await testCredential(alice.id, credential.id, 'ping');

    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('refuses to test a credential owned by someone else', async () => {
    const bobsCredential = await createCredential(bob.id, {
      provider: 'groq',
      label: "Bob's",
      model: 'm',
      apiKey: 'k',
    });

    await expect(testCredential(alice.id, bobsCredential.id, 'ping')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
