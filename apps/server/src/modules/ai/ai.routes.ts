import { Router } from 'express';

import { asyncHandler } from '../../middleware/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { postAsk } from './ai.controller';

export const aiRouter = Router();

aiRouter.use(authenticate);
aiRouter.post('/ask', asyncHandler(postAsk));
