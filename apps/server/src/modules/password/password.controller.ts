import type { Request, Response } from 'express';

import { forgotPasswordSchema, resetPasswordSchema } from './password.schemas';
import { requestPasswordReset, resetPassword } from './password.service';

export async function postForgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = forgotPasswordSchema.parse(req.body);
  await requestPasswordReset(email);

  // Same response regardless of whether the account exists.
  res.status(202).json({
    message: 'If an account exists for that address, a reset link has been sent',
  });
}

export async function postResetPassword(req: Request, res: Response): Promise<void> {
  const { token, password } = resetPasswordSchema.parse(req.body);
  await resetPassword(token, password);

  // The original rendered a full HTML page from the controller. The API returns
  // JSON; rendering belongs to the React client (Stage C).
  res.status(200).json({ message: 'Password updated successfully' });
}
