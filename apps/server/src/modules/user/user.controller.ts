import type { Request, Response } from 'express';

import { requireUser } from '../../middleware/authenticate';
import { loginSchema, signUpSchema } from './user.schemas';
import { login, signUp } from './user.service';

export async function postSignUp(req: Request, res: Response): Promise<void> {
  const input = signUpSchema.parse(req.body);
  const result = await signUp(input);
  res.status(201).json(result);
}

export async function postLogin(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  const result = await login(input);
  res.status(200).json(result);
}

export function getMe(req: Request, res: Response): void {
  res.status(200).json(requireUser(req).toPublicJSON());
}
