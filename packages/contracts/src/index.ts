import { z } from 'zod';

/**
 * The contract between the server and the React client.
 *
 * Types are *derived from* zod schemas rather than declared alongside them, so
 * there is one definition per payload. The client validates responses with the
 * schemas (Decision 8: an HTTP response is a real I/O boundary and gets
 * narrowed, not asserted); the server uses the inferred types.
 */

export const MESSAGE_KINDS = ['text', 'file'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

// --- LLM provider credentials (BYOK) ---

/**
 * Every provider here exposes an OpenAI-compatible chat-completions endpoint,
 * so the server never needs a vendor-specific SDK (Decision 7) — only a
 * different base URL. `custom` covers anything else that speaks the same
 * dialect (a self-hosted OpenAI-compatible gateway, a new free-tier provider
 * that shows up later, etc).
 */
export const PROVIDER_KINDS = [
  'ollama',
  'openrouter',
  'groq',
  'gemini',
  'cloudflare',
  'custom',
] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const llmCredentialSchema = z.object({
  id: z.number(),
  provider: z.enum(PROVIDER_KINDS),
  label: z.string(),
  model: z.string(),
  baseUrl: z.string().nullable(),
  /** Last few characters only — the key itself never leaves the server. */
  maskedApiKey: z.string().nullable(),
  priority: z.number(),
  enabled: z.boolean(),
});
export type LlmCredential = z.infer<typeof llmCredentialSchema>;

export const llmCredentialListSchema = z.array(llmCredentialSchema);

export const llmCredentialTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  sample: z.string().optional(),
});
export type LlmCredentialTestResult = z.infer<typeof llmCredentialTestResultSchema>;

// --- REST ---

export const publicUserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const authResponseSchema = z.object({
  token: z.string(),
  user: publicUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const groupSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  isAdmin: z.boolean(),
});
export type GroupSummary = z.infer<typeof groupSummarySchema>;

export const groupMemberSchema = z.object({
  userId: z.number(),
  name: z.string(),
  email: z.string(),
  isAdmin: z.boolean(),
});
export type GroupMember = z.infer<typeof groupMemberSchema>;

export const groupDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  members: z.array(groupMemberSchema),
});
export type GroupDetail = z.infer<typeof groupDetailSchema>;

export const messageSchema = z.object({
  id: z.number(),
  groupId: z.number(),
  body: z.string(),
  kind: z.enum(MESSAGE_KINDS),
  attachmentUrl: z.string().nullable(),
  attachmentName: z.string().nullable(),
  createdAt: z.string(),
  author: z.object({ id: z.number(), name: z.string() }),
});
export type MessageDto = z.infer<typeof messageSchema>;

export const messageListSchema = z.array(messageSchema);
export const groupSummaryListSchema = z.array(groupSummarySchema);

/** Error envelope produced by the server's error middleware. */
export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

// --- Socket ---

export const typingEventSchema = z.object({
  groupId: z.number(),
  userId: z.number(),
  name: z.string(),
});
export type TypingEvent = z.infer<typeof typingEventSchema>;

export const presenceEventSchema = z.object({
  groupId: z.number(),
  userId: z.number(),
  name: z.string(),
  onlineUserIds: z.array(z.number()),
});
export type PresenceEvent = z.infer<typeof presenceEventSchema>;

export type JoinResult = { ok: true; onlineUserIds: number[] } | { ok: false; error: string };
export type SendResult = { ok: true; message: MessageDto } | { ok: false; error: string };

export interface ServerToClientEvents {
  'message:new': (message: MessageDto) => void;
  'typing:start': (event: TypingEvent) => void;
  'typing:stop': (event: TypingEvent) => void;
  'presence:join': (event: PresenceEvent) => void;
  'presence:leave': (event: PresenceEvent) => void;
  'error:occurred': (error: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'group:join': (groupId: number, ack?: (result: JoinResult) => void) => void;
  'group:leave': (groupId: number) => void;
  'message:send': (
    payload: { groupId: number; body: string },
    ack?: (result: SendResult) => void,
  ) => void;
  'typing:start': (groupId: number) => void;
  'typing:stop': (groupId: number) => void;
}

/** Socket.io room name for a group. Single source of truth for the convention. */
export function groupRoom(groupId: number): string {
  return `group:${groupId}`;
}
