import type { Request, Response } from 'express';

import { ValidationError } from '../../errors/app-error';
import { requireUser } from '../../middleware/authenticate';
import { buildAttachmentKey, uploadToS3 } from '../../services/s3.service';
import { groupIdParamSchema } from '../group/group.schemas';
import { requireMembership } from '../group/membership.service';
import { listMessagesQuerySchema, sendMessageSchema } from './message.schemas';
import { createMessage, listMessages } from './message.service';

export async function postMessage(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { groupId } = groupIdParamSchema.parse(req.params);
  const input = sendMessageSchema.parse(req.body);

  res.status(201).json(await createMessage(user, groupId, { body: input.body }));
}

export async function getMessages(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const query = listMessagesQuerySchema.parse({ ...req.query, groupId: req.params.groupId });

  const options: { afterId?: number; limit?: number } = {};
  if (query.afterId !== undefined) {
    options.afterId = query.afterId;
  }
  if (query.limit !== undefined) {
    options.limit = query.limit;
  }

  res.status(200).json(await listMessages(user.id, query.groupId, options));
}

export async function postAttachment(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { groupId } = groupIdParamSchema.parse(req.params);

  const file = req.file;
  if (!file) {
    throw new ValidationError('A file is required', { file: ['No file was uploaded'] });
  }

  // Checked before the upload, not just inside createMessage — otherwise a
  // non-member could push objects into the bucket and only then be rejected.
  await requireMembership(user.id, groupId);

  const key = buildAttachmentKey(groupId, user.id, file.originalname);
  const uploaded = await uploadToS3(key, file.buffer, file.mimetype);

  // Structured attachment fields — the original injected a raw `<a href=...>`
  // string into the message body and the client rendered it with innerHTML.
  const message = await createMessage(user, groupId, {
    body: file.originalname,
    kind: 'file',
    attachmentUrl: uploaded.url,
    attachmentName: file.originalname,
  });

  res.status(201).json(message);
}
