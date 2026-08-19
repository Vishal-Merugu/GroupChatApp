import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Sequelize } from 'sequelize';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import type { Server } from 'socket.io';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { User } from '../models/user';
import { createGroup } from '../modules/group/group.service';
import { signAccessToken } from '../modules/auth/token.service';
import { createMessage } from '../modules/message/message.service';
import { createTestDatabase } from '../test/db';
import { createGateway } from './gateway';
import type { JoinResult, MessageDto, SendResult } from './events';

/** Waits for a named event, failing fast rather than hanging the suite. */
function waitFor<T>(socket: ClientSocket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connect(port: number, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = createClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

describe('realtime gateway', () => {
  let sequelize: Sequelize;
  let httpServer: HttpServer;
  let io: Server;
  let port: number;
  let owner: User;
  let member: User;
  let outsider: User;
  let groupId: number;
  const clients: ClientSocket[] = [];

  beforeEach(async () => {
    sequelize = await createTestDatabase();

    owner = await User.create({
      name: 'Owner',
      email: 'owner@example.com',
      phone: '+491234567890',
      password: 'hashed',
    });
    member = await User.create({
      name: 'Member',
      email: 'member@example.com',
      phone: '+491234567890',
      password: 'hashed',
    });
    outsider = await User.create({
      name: 'Outsider',
      email: 'outsider@example.com',
      phone: '+491234567890',
      password: 'hashed',
    });

    groupId = (await createGroup(owner, { name: 'Planning', members: [member.email], admins: [] }))
      .id;

    httpServer = createServer();
    io = createGateway(httpServer, '*');
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.disconnect();
    }
    await io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await sequelize.close();
  });

  async function connectAs(user: User): Promise<ClientSocket> {
    const socket = await connect(port, signAccessToken({ id: user.id, name: user.name }));
    clients.push(socket);
    return socket;
  }

  function join(socket: ClientSocket, id: number): Promise<JoinResult> {
    return new Promise((resolve) => socket.emit('group:join', id, resolve));
  }

  it('refuses a connection with no token', async () => {
    await expect(connect(port, '')).rejects.toThrow();
  });

  it('refuses a connection with an invalid token', async () => {
    await expect(connect(port, 'clearly-not-a-jwt')).rejects.toThrow();
  });

  it('accepts a connection with a valid token', async () => {
    const socket = await connectAs(owner);
    expect(socket.connected).toBe(true);
  });

  it('lets a member join their group', async () => {
    const socket = await connectAs(owner);
    const result = await join(socket, groupId);

    expect(result).toMatchObject({ ok: true });
  });

  it('refuses a join from a non-member', async () => {
    // Without this check, any authenticated user could subscribe to any room
    // and receive every message posted in it.
    const socket = await connectAs(outsider);
    const result = await join(socket, groupId);

    expect(result).toEqual({ ok: false, error: 'You are not a member of this group' });
  });

  it('delivers a message to other members in the room', async () => {
    const ownerSocket = await connectAs(owner);
    const memberSocket = await connectAs(member);
    await join(ownerSocket, groupId);
    await join(memberSocket, groupId);

    const received = waitFor<MessageDto>(memberSocket, 'message:new');
    ownerSocket.emit('message:send', { groupId, body: 'hello room' });

    expect((await received).body).toBe('hello room');
  });

  it('does not deliver a message to a socket that never joined', async () => {
    const ownerSocket = await connectAs(owner);
    const memberSocket = await connectAs(member);
    await join(ownerSocket, groupId);

    let leaked = false;
    memberSocket.on('message:new', () => {
      leaked = true;
    });

    ownerSocket.emit('message:send', { groupId, body: 'hello room' });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(leaked).toBe(false);
  });

  it('rejects a send into a group the sender does not belong to', async () => {
    const socket = await connectAs(outsider);

    const result = await new Promise<SendResult>((resolve) =>
      socket.emit('message:send', { groupId, body: 'intrusion' }, resolve),
    );

    expect(result.ok).toBe(false);
  });

  it('rejects an empty message body over the socket', async () => {
    // Socket payloads get the same validation as HTTP bodies.
    const socket = await connectAs(owner);
    await join(socket, groupId);

    const result = await new Promise<SendResult>((resolve) =>
      socket.emit('message:send', { groupId, body: '   ' }, resolve),
    );

    expect(result.ok).toBe(false);
  });

  it('broadcasts a message posted through the REST path to socket clients', async () => {
    // Both entry points go through the same broadcaster, so a REST post must
    // reach live clients too.
    const memberSocket = await connectAs(member);
    await join(memberSocket, groupId);

    const received = waitFor<MessageDto>(memberSocket, 'message:new');
    await createMessage(owner, groupId, { body: 'posted over http' });

    expect((await received).body).toBe('posted over http');
  });

  it('forwards typing indicators to the rest of the room', async () => {
    const ownerSocket = await connectAs(owner);
    const memberSocket = await connectAs(member);
    await join(ownerSocket, groupId);
    await join(memberSocket, groupId);

    const typing = waitFor<{ userId: number }>(memberSocket, 'typing:start');
    ownerSocket.emit('typing:start', groupId);

    expect((await typing).userId).toBe(owner.id);
  });

  it('ignores a typing indicator for a room the socket never joined', async () => {
    const ownerSocket = await connectAs(owner);
    const memberSocket = await connectAs(member);
    await join(memberSocket, groupId);

    let leaked = false;
    memberSocket.on('typing:start', () => {
      leaked = true;
    });

    ownerSocket.emit('typing:start', groupId);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(leaked).toBe(false);
  });

  it('announces presence when another member joins', async () => {
    const memberSocket = await connectAs(member);
    await join(memberSocket, groupId);

    const presence = waitFor<{ userId: number }>(memberSocket, 'presence:join');
    const ownerSocket = await connectAs(owner);
    await join(ownerSocket, groupId);

    expect((await presence).userId).toBe(owner.id);
  });

  it('announces presence when a member disconnects', async () => {
    const ownerSocket = await connectAs(owner);
    const memberSocket = await connectAs(member);
    await join(ownerSocket, groupId);
    await join(memberSocket, groupId);

    const left = waitFor<{ userId: number }>(memberSocket, 'presence:leave');
    ownerSocket.disconnect();

    expect((await left).userId).toBe(owner.id);
  });
});
