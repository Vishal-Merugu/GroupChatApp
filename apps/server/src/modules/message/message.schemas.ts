import { z } from 'zod';

import { MAX_MESSAGE_PAGE_SIZE } from './message.service';

export const MAX_MESSAGE_LENGTH = 4000;

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(MAX_MESSAGE_LENGTH),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** Socket payloads get the same validation as HTTP bodies — same trust level. */
export const socketSendMessageSchema = sendMessageSchema.extend({
  groupId: z.coerce.number().int().positive(),
});

export const listMessagesQuerySchema = z.object({
  groupId: z.coerce.number().int().positive(),
  afterId: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(MAX_MESSAGE_PAGE_SIZE).optional(),
});
