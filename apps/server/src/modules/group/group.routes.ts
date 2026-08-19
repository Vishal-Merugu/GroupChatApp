import { Router } from 'express';

import { asyncHandler } from '../../middleware/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { getGroup, getGroups, postGroup, putGroup, removeGroup } from './group.controller';

export const groupRouter = Router();

// Every group route requires a session — applied once here rather than
// remembered per-route, which is how the original left endpoints unprotected.
groupRouter.use(authenticate);

groupRouter.post('/', asyncHandler(postGroup));
groupRouter.get('/', asyncHandler(getGroups));
groupRouter.get('/:groupId', asyncHandler(getGroup));
groupRouter.put('/:groupId', asyncHandler(putGroup));
groupRouter.delete('/:groupId', asyncHandler(removeGroup));
