import type { Request, Response } from 'express';

import { requireUser } from '../../middleware/authenticate';
import { createGroupSchema, groupIdParamSchema, updateGroupSchema } from './group.schemas';
import {
  createGroup,
  deleteGroup,
  getGroupDetail,
  listGroupsForUser,
  updateGroup,
} from './group.service';

export async function postGroup(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const input = createGroupSchema.parse(req.body);
  res.status(201).json(await createGroup(user, input));
}

export async function getGroups(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  res.status(200).json(await listGroupsForUser(user.id));
}

export async function getGroup(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { groupId } = groupIdParamSchema.parse(req.params);
  res.status(200).json(await getGroupDetail(user.id, groupId));
}

export async function putGroup(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { groupId } = groupIdParamSchema.parse(req.params);
  const input = updateGroupSchema.parse(req.body);
  res.status(200).json(await updateGroup(user, groupId, input));
}

export async function removeGroup(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { groupId } = groupIdParamSchema.parse(req.params);
  await deleteGroup(user, groupId);
  res.status(204).send();
}
