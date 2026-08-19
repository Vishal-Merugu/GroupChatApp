import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
});

export const resetPasswordSchema = z.object({
  token: z.string().uuid('Invalid reset token'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
