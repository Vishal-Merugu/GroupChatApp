/**
 * Socket event shapes live in `@groupchat/contracts` so the React client
 * imports the exact same declarations. Re-exported here so server code can keep
 * importing from `realtime/events`.
 */
export type {
  ClientToServerEvents,
  JoinResult,
  MessageDto,
  PresenceEvent,
  SendResult,
  ServerToClientEvents,
  TypingEvent,
} from '@groupchat/contracts';

export { groupRoom } from '@groupchat/contracts';

/** Data attached to each authenticated socket. Server-only — never on the wire. */
export interface SocketData {
  userId: number;
  userName: string;
}
