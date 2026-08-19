import { PROVIDER_KINDS } from '@groupchat/contracts';
import { PROVIDER_PRESETS } from '@groupchat/llm';
import { z } from 'zod';

/**
 * Per-provider requirements come from the same registry the chain builder
 * uses (`PROVIDER_PRESETS`), so "does cloudflare need a base URL" is answered
 * in exactly one place.
 */
export const createLlmCredentialSchema = z
  .object({
    provider: z.enum(PROVIDER_KINDS),
    label: z.string().trim().min(1, 'A label is required').max(60),
    model: z.string().trim().min(1, 'A model name is required').max(120),
    baseUrl: z.string().trim().url('Must be a valid URL').optional(),
    apiKey: z.string().trim().min(1).max(4000).optional(),
  })
  .superRefine((value, ctx) => {
    const preset = PROVIDER_PRESETS[value.provider];

    if (preset.requiresBaseUrl && !value.baseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseUrl'],
        message: `${preset.label} requires a base URL`,
      });
    }
    if (preset.requiresApiKey && !value.apiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apiKey'],
        message: `${preset.label} requires an API key`,
      });
    }
    // Ollama always uses the server's own local instance. A user-suppliable
    // baseUrl here would be an SSRF hole with no HTTPS requirement to catch it
    // (Ollama's own client doesn't enforce HTTPS the way OpenAiCompatibleProvider
    // does) — so it is never accepted, not even validated and allowed through.
    if (value.provider === 'ollama' && value.baseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseUrl'],
        message: 'Ollama always uses the server’s local instance and does not accept a custom base URL',
      });
    }
  });

export type CreateLlmCredentialInput = z.infer<typeof createLlmCredentialSchema>;

export const updateLlmCredentialSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  baseUrl: z.string().trim().url().optional(),
  // Optional: omit to keep the existing key, send to rotate it.
  apiKey: z.string().trim().min(1).max(4000).optional(),
  enabled: z.boolean().optional(),
});

export type UpdateLlmCredentialInput = z.infer<typeof updateLlmCredentialSchema>;

export const reorderLlmCredentialsSchema = z.object({
  orderedIds: z.array(z.number().int().positive()).min(1).max(50),
});

export const credentialIdParamSchema = z.object({
  credentialId: z.coerce.number().int().positive(),
});

export const testPromptSchema = z.object({
  prompt: z.string().trim().min(1).max(500).default('Reply with just the word OK.'),
});
