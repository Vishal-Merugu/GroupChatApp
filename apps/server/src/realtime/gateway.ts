import type { Server as HttpServer } from 'node:http';

import { Server, type Socket } from 'socket.io';
import { z } from 'zod';

import { errorToString } from '../errors/app-error';
import { User } from '../models/user';
import { isMember } from '../modules/group/membership.service';
import { socketSendMessageSchema } from '../modules/message/message.schemas';
import { createMessage } from '../modules/message/message.service';
import { extractBearerToken, verifyAccessToken } from '../modules/auth/token.service';
import { logger } from '../utils/logger';
import { setBroadcaster } from './broadcaster';
import {
  groupRoom,
  type ClientToServerEvents,
  type MessageDto,
  type ServerToClientEvents,
  type SocketData,
} from './events';

type ChatServer = Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;

const groupIdSchema = z.coerce.number().int().positive();

/**
 * The real-time gateway — the gap section 2 of the spec calls the actual
 * foundational one. REST still owns auth and history; sockets own live delivery.
 */
export function createGateway(httpServer: HttpServer, corsOrigin: string): ChatServer {
  const io: ChatServer = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  // Handshake auth: a socket is authenticated once, at connect, rather than
  // per-event. An unauthenticated socket never reaches a handler.
  io.use((socket, next) => {
    // Socket.io middleware expects a void return, so the async work runs in an
    // IIFE rather than making the callback itself async.
    void (async () => {
      try {
        // `handshake.auth` is an untyped bag of client-supplied values.
        const raw: unknown = socket.handshake.auth.token;
        const header = typeof raw === 'string' ? raw : socket.handshake.headers.authorization;
        const payload = verifyAccessToken(extractBearerToken(header));

        const user = await User.findByPk(payload.sub);
        if (!user) {
          next(new Error('Account no longer exists'));
          return;
        }

        socket.data.userId = user.id;
        socket.data.userName = user.name;
        next();
      } catch (error) {
        next(new Error(errorToString(error)));
      }
    })();
  });

  io.on('connection', (socket) => {
    logger.info('Socket connected', { userId: socket.data.userId, socketId: socket.id });
    registerHandlers(io, socket);
  });

  // Business logic now reaches the wire without importing socket.io.
  setBroadcaster({
    messageCreated: (message: MessageDto) => {
      io.to(groupRoom(message.groupId)).emit('message:new', message);
    },
  });

  return io;
}

function registerHandlers(io: ChatServer, socket: ChatSocket): void {
  const { userId, userName } = socket.data;

  socket.on('group:join', (rawGroupId, ack) => {
    void (async () => {
      try {
        const groupId = groupIdSchema.parse(rawGroupId);

        // Membership is re-checked on join. Without this, any authenticated
        // user could join `group:42` and receive every message in it.
        if (!(await isMember(userId, groupId))) {
          ack?.({ ok: false, error: 'You are not a member of this group' });
          return;
        }

        await socket.join(groupRoom(groupId));
        const onlineUserIds = await onlineUserIdsIn(io, groupId);

        socket.to(groupRoom(groupId)).emit('presence:join', {
          groupId,
          userId,
          name: userName,
          onlineUserIds,
        });
        ack?.({ ok: true, onlineUserIds });
      } catch (error) {
        ack?.({ ok: false, error: errorToString(error) });
      }
    })();
  });

  socket.on('group:leave', (rawGroupId) => {
    void (async () => {
      const parsed = groupIdSchema.safeParse(rawGroupId);
      if (!parsed.success) {
        return;
      }
      const groupId = parsed.data;
      await socket.leave(groupRoom(groupId));
      socket.to(groupRoom(groupId)).emit('presence:leave', {
        groupId,
        userId,
        name: userName,
        onlineUserIds: await onlineUserIdsIn(io, groupId),
      });
    })();
  });

  socket.on('message:send', (payload, ack) => {
    void (async () => {
      try {
        // Socket payloads are validated exactly like HTTP bodies — a socket
        // client is no more trusted than an HTTP one.
        const input = socketSendMessageSchema.parse(payload);

        const author = await User.findByPk(userId);
        if (!author) {
          ack?.({ ok: false, error: 'Account no longer exists' });
          return;
        }

        // createMessage broadcasts through the shared broadcaster, so the
        // sender's own other tabs receive it on the same path as everyone else.
        const message = await createMessage(author, input.groupId, { body: input.body });
        ack?.({ ok: true, message });
      } catch (error) {
        const reason = errorToString(error);
        logger.warn('Socket message rejected', { userId, reason });
        ack?.({ ok: false, error: reason });
      }
    })();
  });

  socket.on('typing:start', (rawGroupId) => {
    forwardTyping(socket, rawGroupId, 'typing:start');
  });

  socket.on('typing:stop', (rawGroupId) => {
    forwardTyping(socket, rawGroupId, 'typing:stop');
  });

  socket.on('disconnecting', () => {
    // Rooms are still attached during `disconnecting`; by `disconnect` they are
    // gone and there is no way to tell whom to notify.
    for (const room of socket.rooms) {
      const groupId = parseGroupRoom(room);
      if (groupId === undefined) {
        continue;
      }
      socket.to(room).emit('presence:leave', {
        groupId,
        userId,
        name: userName,
        onlineUserIds: [],
      });
    }
    logger.info('Socket disconnected', { userId, socketId: socket.id });
  });
}

function forwardTyping(
  socket: ChatSocket,
  rawGroupId: unknown,
  event: 'typing:start' | 'typing:stop',
): void {
  const parsed = groupIdSchema.safeParse(rawGroupId);
  if (!parsed.success) {
    return;
  }
  const room = groupRoom(parsed.data);
  // Only forwarded if the socket is actually in the room — a typing indicator
  // must not become a way to ping a group you never joined.
  if (!socket.rooms.has(room)) {
    return;
  }
  socket.to(room).emit(event, {
    groupId: parsed.data,
    userId: socket.data.userId,
    name: socket.data.userName,
  });
}

async function onlineUserIdsIn(io: ChatServer, groupId: number): Promise<number[]> {
  const sockets = await io.in(groupRoom(groupId)).fetchSockets();
  return [...new Set(sockets.map((entry) => entry.data.userId))];
}

function parseGroupRoom(room: string): number | undefined {
  const match = /^group:(\d+)$/.exec(room);
  if (!match?.[1]) {
    return undefined;
  }
  return Number(match[1]);
}
