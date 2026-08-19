import { Router } from 'express';

import { asyncHandler } from '../../middleware/async-handler';
import { authenticate } from '../../middleware/authenticate';
import { getMe, postLogin, postSignUp } from './user.controller';

export const userRouter = Router();

userRouter.post('/signup', asyncHandler(postSignUp));
userRouter.post('/login', asyncHandler(postLogin));
userRouter.get('/me', authenticate, asyncHandler(getMe));
