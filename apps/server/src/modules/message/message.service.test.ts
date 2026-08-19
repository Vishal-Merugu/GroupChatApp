import type { Sequelize } from 'sequelize';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { User } from '../../models/user';
import { setBroadcaster } from '../../realtime/broadcaster';
import type { MessageDto } from '../../realtime/events';
import { createTestDatabase } from '../../test/db';
import { createGroup } from '../group/group.service';
import { createMessage, listMessages } from './message.service';

async function makeUser(name: string): Promise<User> {
  return User.create({
    name,
    email: `${name.toLowerCase()}@example.com`,
    phone: '+491234567890',
    password: 'hashed',
  });
}

describe('message service', () => {
  let sequelize: Sequelize;
  let author: User;
  let outsider: User;
  let groupId: number;

  beforeEach(async () => {
    sequelize = await createTestDatabase();
    author = await makeUser('Author');
    outsider = await makeUser('Outsider');
    groupId = (await createGroup(author, { name: 'Planning', members: [], admins: [] })).id;
  });

  afterEach(async () => {
    await sequelize.close();
  });

  it('persists a message and returns it with its author', async () => {
    const message = await createMessage(author, groupId, { body: 'hello' });

    expect(message.body).toBe('hello');
    expect(message.author).toEqual({ id: author.id, name: author.name });
    expect(message.kind).toBe('text');
  });

  it('broadcasts every created message exactly once', async () => {
    const messageCreated = vi.fn<(message: MessageDto) => void>();
    setBroadcaster({ messageCreated });

    const message = await createMessage(author, groupId, { body: 'hello' });

    expect(messageCreated).toHaveBeenCalledTimes(1);
    expect(messageCreated).toHaveBeenCalledWith(message);
  });

  it('refuses to post into a group the sender does not belong to', async () => {
    await expect(createMessage(outsider, groupId, { body: 'intrusion' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('does not broadcast a message it refused to persist', async () => {
    const messageCreated = vi.fn<(message: MessageDto) => void>();
    setBroadcaster({ messageCreated });

    await createMessage(outsider, groupId, { body: 'intrusion' }).catch(() => undefined);

    expect(messageCreated).not.toHaveBeenCalled();
  });

  it('refuses to read history of a group the caller does not belong to', async () => {
    // The original's GET /chat/messages had no auth middleware at all.
    await createMessage(author, groupId, { body: 'secret' });

    await expect(listMessages(outsider.id, groupId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns history in ascending id order', async () => {
    await createMessage(author, groupId, { body: 'first' });
    await createMessage(author, groupId, { body: 'second' });
    await createMessage(author, groupId, { body: 'third' });

    const messages = await listMessages(author.id, groupId);

    expect(messages.map((m) => m.body)).toEqual(['first', 'second', 'third']);
  });

  it('pages from a cursor, excluding the cursor message itself', async () => {
    const first = await createMessage(author, groupId, { body: 'first' });
    await createMessage(author, groupId, { body: 'second' });

    const messages = await listMessages(author.id, groupId, { afterId: first.id });

    expect(messages.map((m) => m.body)).toEqual(['second']);
  });

  it('never returns messages from another group', async () => {
    const other = await createGroup(author, { name: 'Other', members: [], admins: [] });
    await createMessage(author, groupId, { body: 'in planning' });
    await createMessage(author, other.id, { body: 'in other' });

    const messages = await listMessages(author.id, groupId);

    expect(messages.map((m) => m.body)).toEqual(['in planning']);
  });

  it('caps the page size even when a larger limit is requested', async () => {
    for (let i = 0; i < 5; i += 1) {
      await createMessage(author, groupId, { body: `message ${i}` });
    }

    const messages = await listMessages(author.id, groupId, { limit: 100_000 });

    expect(messages.length).toBeLessThanOrEqual(100);
  });

  it('keeps attachments as structured fields rather than markup in the body', async () => {
    // The original stored `<a href="...">name</a>` in the message text.
    const message = await createMessage(author, groupId, {
      body: 'report.pdf',
      kind: 'file',
      attachmentUrl: 'https://bucket.s3.eu-central-1.amazonaws.com/report.pdf',
      attachmentName: 'report.pdf',
    });

    expect(message.kind).toBe('file');
    expect(message.body).not.toContain('<a');
    expect(message.attachmentUrl).toContain('report.pdf');
  });
});
