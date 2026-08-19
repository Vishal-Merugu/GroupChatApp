import type { Express } from 'express';
import type { Sequelize } from 'sequelize';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from './app';
import { createTestDatabase } from './test/db';

/** End-to-end through the real middleware stack, including the error handler. */
describe('HTTP API', () => {
  let sequelize: Sequelize;
  let app: Express;

  beforeEach(async () => {
    sequelize = await createTestDatabase();
    app = createApp({ corsOrigin: '*' });
  });

  afterEach(async () => {
    await sequelize.close();
  });

  async function signUp(email: string): Promise<{ token: string; id: number }> {
    const response = await request(app).post('/api/auth/signup').send({
      name: 'Tester',
      email,
      phone: '+491234567890',
      password: 'correct-horse-battery',
    });
    return { token: response.body.token, id: response.body.user.id };
  }

  it('reports healthy', async () => {
    await request(app).get('/health').expect(200, { status: 'ok' });
  });

  it('signs up and returns a token', async () => {
    const response = await request(app).post('/api/auth/signup').send({
      name: 'Tester',
      email: 'tester@example.com',
      phone: '+491234567890',
      password: 'correct-horse-battery',
    });

    expect(response.status).toBe(201);
    expect(response.body.token).toBeTypeOf('string');
    expect(response.body.user).not.toHaveProperty('password');
  });

  it('returns a 400 with field details for an invalid body', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({ name: '', email: 'not-an-email', phone: 'x', password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(response.body.error.details).sort()).toEqual([
      'email',
      'name',
      'password',
      'phone',
    ]);
  });

  it('rejects a protected route without a token', async () => {
    // The original never responded at all here — the request hung until timeout.
    const response = await request(app).get('/api/groups');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a garbage token with 401 rather than hanging', async () => {
    const response = await request(app)
      .get('/api/groups')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(response.status).toBe(401);
  });

  it('accepts a bare token as well as a Bearer token', async () => {
    const { token } = await signUp('tester@example.com');

    await request(app).get('/api/groups').set('Authorization', token).expect(200);
    await request(app).get('/api/groups').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('runs the full create-group, post-message, read-history flow', async () => {
    const owner = await signUp('owner@example.com');
    await signUp('member@example.com');

    const group = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Planning', members: ['member@example.com'], admins: [] })
      .expect(201);

    await request(app)
      .post(`/api/groups/${group.body.id}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ body: 'first message' })
      .expect(201);

    const history = await request(app)
      .get(`/api/groups/${group.body.id}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(history.body).toHaveLength(1);
    expect(history.body[0].body).toBe('first message');
    expect(history.body[0].author.id).toBe(owner.id);
  });

  it('hides another user\'s group history', async () => {
    const owner = await signUp('owner@example.com');
    const outsider = await signUp('outsider@example.com');

    const group = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Private', members: [], admins: [] })
      .expect(201);

    await request(app)
      .get(`/api/groups/${group.body.id}/messages`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);
  });

  it('rejects an empty message body', async () => {
    const owner = await signUp('owner@example.com');
    const group = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Planning', members: [], admins: [] })
      .expect(201);

    await request(app)
      .post(`/api/groups/${group.body.id}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ body: '   ' })
      .expect(400);
  });

  it('answers the same way whether or not a reset address is registered', async () => {
    await signUp('known@example.com');

    const known = await request(app)
      .post('/api/password/forgot')
      .send({ email: 'known@example.com' });
    const unknown = await request(app)
      .post('/api/password/forgot')
      .send({ email: 'nobody@example.com' });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
  });

  it('404s an unknown route as JSON', async () => {
    const response = await request(app).get('/api/nope');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
