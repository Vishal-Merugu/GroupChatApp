import { z } from 'zod';

export const askSchema = z.object({
  prompt: z.string().trim().min(1, 'A prompt is required').max(4000),
});
