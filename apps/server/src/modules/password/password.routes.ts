import { Router } from 'express';

import { asyncHandler } from '../../middleware/async-handler';
import { postForgotPassword, postResetPassword } from './password.controller';

export const passwordRouter = Router();

passwordRouter.post('/forgot', asyncHandler(postForgotPassword));
passwordRouter.post('/reset', asyncHandler(postResetPassword));
