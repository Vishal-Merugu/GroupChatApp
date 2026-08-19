import { z } from 'zod';

/**
 * Request bodies are validated at the boundary rather than destructured and
 * trusted. Decision 8: narrow unknown input with a runtime validator.
 */
export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{6,20}$/, 'A valid phone number is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
