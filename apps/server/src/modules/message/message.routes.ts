import { Router } from 'express';
import multer from 'multer';

import { asyncHandler } from '../../middleware/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { getMessages, postAttachment, postMessage } from './message.controller';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Memory storage + an explicit size cap. The original appended the raw request
// stream to a file in the process's working directory with no limit at all.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

// Mounted under /api/groups/:groupId/messages — a message only exists inside a
// group, so the group id belongs in the path rather than a query string.
export const messageRouter = Router({ mergeParams: true });

messageRouter.use(authenticate);

messageRouter.get('/', asyncHandler(getMessages));
messageRouter.post('/', asyncHandler(postMessage));
messageRouter.post('/attachments', upload.single('file'), asyncHandler(postAttachment));
