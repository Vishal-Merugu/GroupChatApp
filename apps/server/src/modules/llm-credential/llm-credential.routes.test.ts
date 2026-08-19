import type { Express } from 'express';
import type { Sequelize } from 'sequelize';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import { ValidationError } from '../../errors/app-error';
import { createTestDatabase } from '../../test/db';
import * as urlSafety from '../../utils/url-safety';

describe('LLM credential API', () => {
  let sequelize: Sequelize;
  let app: Express;

  beforeEach(async () => {
    sequelize = await createTestDatabase();
    app = createApp({ corsOrigin: '*' });
    vi.spyOn(urlSafety, 'assertPublicHttpsUrl').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await sequelize.close();
  });

  async function signUp(email: string): Promise<string> {
    const response = await request(app).post('/api/auth/signup').send({
      name: 'Tester',
      email,
      phone: '+491234567890',
      password: 'correct-horse-battery',
    });
    return response.body.token as string;
  }

  it('rejects unauthenticated access', async () => {
    await request(app).get('/api/llm-credentials').expect(401);
  });

  it('creates a credential and never returns the raw key', async () => {
    const token = await signUp('user@example.com');

    const response = await request(app)
      .post('/api/llm-credentials')
      .set('authorization', `Bearer ${token}`)
      .send({
        provider: 'groq',
        label: 'My Groq key',
        model: 'llama-3.3-70b-versatile',
        apiKey: 'gsk_realsecretvalue1234',
      });

    expect(response.status).toBe(201);
    expect(response.body.maskedApiKey).toBe('••••1234');
    expect(JSON.stringify(response.body)).not.toContain('gsk_realsecretvalue1234');
  });

  it('returns a 400 with field detail for a hosted provider missing a key', async () => {
    const token = await signUp('user@example.com');

    const response = await request(app)
      .post('/api/llm-credentials')
      .set('authorization', `Bearer ${token}`)
      .send({ provider: 'groq', label: 'No key', model: 'llama3' });

    expect(response.status).toBe(400);
    expect(response.body.error.details.apiKey).toBeTruthy();
  });

  it('lists only the caller\'s own credentials', async () => {
    const aliceToken = await signUp('alice@example.com');
    const bobToken = await signUp('bob@example.com');

    await request(app)
      .post('/api/llm-credentials')
      .set('authorization', `Bearer ${aliceToken}`)
      .send({ provider: 'groq', label: 'Alice', model: 'llama3', apiKey: 'gsk_alice' });

    const bobList = await request(app)
      .get('/api/llm-credentials')
      .set('authorization', `Bearer ${bobToken}`);

    expect(bobList.body).toEqual([]);
  });

  it('404s deleting a credential that belongs to someone else', async () => {
    const aliceToken = await signUp('alice@example.com');
    const bobToken = await signUp('bob@example.com');

    const created = await request(app)
      .post('/api/llm-credentials')
      .set('authorization', `Bearer ${aliceToken}`)
      .send({ provider: 'groq', label: 'Alice', model: 'llama3', apiKey: 'gsk_alice' });

    await request(app)
      .delete(`/api/llm-credentials/${created.body.id}`)
      .set('authorization', `Bearer ${bobToken}`)
      .expect(404);
  });

  it('rejects a base URL that fails the SSRF check with a 400, not a 500', async () => {
    vi.mocked(urlSafety.assertPublicHttpsUrl).mockRejectedValue(
      new ValidationError('That base URL points to a private or reserved address'),
    );
    const token = await signUp('user@example.com');

    const response = await request(app)
      .post('/api/llm-credentials')
      .set('authorization', `Bearer ${token}`)
      .send({
        provider: 'custom',
        label: 'Sneaky',
        model: 'm',
        apiKey: 'k',
        baseUrl: 'https://169.254.169.254/openai/v1',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('private or reserved');
  });

  it('runs the ask endpoint through a configured credential', async () => {
    const token = await signUp('user@example.com');
    await request(app)
      .post('/api/llm-credentials')
      .set('authorization', `Bearer ${token}`)
      .send({
        provider: 'custom',
        label: 'Fake',
        model: 'm',
        apiKey: 'k',
        baseUrl: 'https://localhost:1/v1',
      });

    // No real network access in tests, so this exercises the wiring rather
    // than a real answer: an unreachable provider surfaces as a 502, not a
    // hang or a 500 from an unhandled rejection.
    const response = await request(app)
      .post('/api/ai/ask')
      .set('authorization', `Bearer ${token}`)
      .send({ prompt: 'hello' });

    expect(response.status).toBe(502);
  });

  it('falls back to the server default when the user has no credentials of their own', async () => {
    // No credentials added, so this exercises the server's own LLM_PROVIDER
    // default (ollama). Unreachable in the test environment, so it surfaces as
    // a 502 rather than the "No AI providers configured" wall — the whole
    // point of the server default is that a brand-new user isn't blocked.
    const token = await signUp('user@example.com');

    const response = await request(app)
      .post('/api/ai/ask')
      .set('authorization', `Bearer ${token}`)
      .send({ prompt: 'hello' });

    expect(response.status).toBe(502);
  });
});
