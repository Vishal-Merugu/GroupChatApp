import type {
  ClientToServerEvents,
  JoinResult,
  MessageDto,
  PresenceEvent,
  SendResult,
  ServerToClientEvents,
  TypingEvent,
} from '@groupchat/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** How long a typing indicator lingers after the last keystroke event. */
const TYPING_TIMEOUT_MS = 3000;

interface UseChatSocketOptions {
  token: string | null;
  groupId: number | null;
  onMessage: (message: MessageDto) => void;
}

interface ChatSocketState {
  connected: boolean;
  typingUsers: string[];
  onlineUserIds: number[];
  sendMessage: (body: string) => Promise<SendResult>;
  notifyTyping: () => void;
}

/**
 * Owns the socket lifecycle for the active group.
 *
 * One connection is kept for the whole session and rooms are swapped on group
 * change, rather than reconnecting — reconnecting would re-run the handshake
 * and drop messages during the gap.
 */
export function useChatSocket(options: UseChatSocketOptions): ChatSocketState {
  const { token, groupId, onMessage } = options;

  const socketRef = useRef<ChatSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);

  const typingTimers = useRef(new Map<number, number>());
  const lastTypingSentAt = useRef(0);

  // Keeps the latest callback reachable without re-subscribing on every render.
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const socket: ChatSocket = io({ auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => {
      setConnected(false);
      setOnlineUserIds([]);
    });
    socket.on('message:new', (message) => onMessageRef.current(message));

    const dropTyping = (userId: number, name: string): void => {
      setTypingUsers((current) => current.filter((entry) => entry !== name));
      const timer = typingTimers.current.get(userId);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        typingTimers.current.delete(userId);
      }
    };

    socket.on('typing:start', (event: TypingEvent) => {
      setTypingUsers((current) =>
        current.includes(event.name) ? current : [...current, event.name],
      );
      // Self-expiring: a sender who closes the tab never emits `typing:stop`,
      // which would otherwise leave the indicator stuck on forever.
      const existing = typingTimers.current.get(event.userId);
      if (existing !== undefined) {
        window.clearTimeout(existing);
      }
      typingTimers.current.set(
        event.userId,
        window.setTimeout(() => dropTyping(event.userId, event.name), TYPING_TIMEOUT_MS),
      );
    });

    socket.on('typing:stop', (event: TypingEvent) => dropTyping(event.userId, event.name));

    const applyPresence = (event: PresenceEvent): void => setOnlineUserIds(event.onlineUserIds);
    socket.on('presence:join', applyPresence);
    socket.on('presence:leave', applyPresence);

    return () => {
      for (const timer of typingTimers.current.values()) {
        window.clearTimeout(timer);
      }
      typingTimers.current.clear();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token]);

  // Join on group change, and leave the previous room on the way out.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || groupId === null) {
      return;
    }

    setTypingUsers([]);
    socket.emit('group:join', groupId, (result: JoinResult) => {
      setOnlineUserIds(result.ok ? result.onlineUserIds : []);
    });

    return () => {
      socket.emit('group:leave', groupId);
    };
  }, [groupId, connected]);

  const sendMessage = useCallback(
    (body: string): Promise<SendResult> =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket || groupId === null) {
          resolve({ ok: false, error: 'Not connected' });
          return;
        }
        socket.emit('message:send', { groupId, body }, resolve);
      }),
    [groupId],
  );

  const notifyTyping = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || groupId === null) {
      return;
    }
    // Throttled: one event per interval rather than one per keystroke.
    const now = Date.now();
    if (now - lastTypingSentAt.current < TYPING_TIMEOUT_MS / 2) {
      return;
    }
    lastTypingSentAt.current = now;
    socket.emit('typing:start', groupId);
  }, [groupId]);

  return { connected, typingUsers, onlineUserIds, sendMessage, notifyTyping };
}
