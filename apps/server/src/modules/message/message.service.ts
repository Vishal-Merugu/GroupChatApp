import { Op } from 'sequelize';

import { Message, type MessageKind } from '../../models/message';
import { User } from '../../models/user';
import { getBroadcaster } from '../../realtime/broadcaster';
import type { MessageDto } from '../../realtime/events';
import { requireMembership } from '../group/membership.service';

export const MAX_MESSAGE_PAGE_SIZE = 100;

interface CreateMessageInput {
  body: string;
  kind?: MessageKind;
  attachmentUrl?: string;
  attachmentName?: string;
}

/**
 * Persists a message, then broadcasts it.
 *
 * Ordering matters and is deliberate (Decision 4): persist and deliver first,
 * and never block delivery on anything else. Stage E hangs asynchronous
 * embedding off this same point — after the broadcast, not before it.
 */
export async function createMessage(
  author: User,
  groupId: number,
  input: CreateMessageInput,
): Promise<MessageDto> {
  await requireMembership(author.id, groupId);

  const message = await Message.create({
    body: input.body,
    kind: input.kind ?? 'text',
    attachmentUrl: input.attachmentUrl ?? null,
    attachmentName: input.attachmentName ?? null,
    userId: author.id,
    groupId,
  });

  const dto = toMessageDto(message, { id: author.id, name: author.name });
  getBroadcaster().messageCreated(dto);

  // TODO(Stage E): enqueue async embedding here — after delivery, never before.
  return dto;
}

export interface ListMessagesOptions {
  /** Cursor: return messages with a higher id. Matches the old `lastmessageid`. */
  afterId?: number;
  limit?: number;
}

export async function listMessages(
  userId: number,
  groupId: number,
  options: ListMessagesOptions = {},
): Promise<MessageDto[]> {
  // The original's GET /chat/messages had no `authenticate` at all: any caller
  // could read any group's history by guessing a numeric group id.
  await requireMembership(userId, groupId);

  const limit = Math.min(options.limit ?? MAX_MESSAGE_PAGE_SIZE, MAX_MESSAGE_PAGE_SIZE);
  const where = {
    groupId,
    ...(options.afterId !== undefined ? { id: { [Op.gt]: options.afterId } } : {}),
  };

  const messages = await Message.findAll({
    where,
    include: [{ model: User, required: true, attributes: ['id', 'name'] }],
    order: [['id', 'ASC']],
    limit,
  });

  return messages.flatMap((message) => {
    const author = message.get('user');
    return author instanceof User
      ? [toMessageDto(message, { id: author.id, name: author.name })]
      : [];
  });
}

export function toMessageDto(message: Message, author: { id: number; name: string }): MessageDto {
  return {
    id: message.id,
    groupId: message.groupId,
    body: message.body,
    kind: message.kind,
    attachmentUrl: message.attachmentUrl ?? null,
    attachmentName: message.attachmentName ?? null,
    createdAt: message.createdAt.toISOString(),
    author: { id: author.id, name: author.name },
  };
}
