import { z } from 'zod';

/**
 * Runtime shapes for provider responses. Decision 8: an LLM API response is an
 * external I/O boundary with an unpredictable shape, so it gets validated at
 * runtime rather than asserted with a cast. Every field is optional because
 * free-tier providers differ in what they actually return.
 */

export const ollamaChatChunkSchema = z.object({
  model: z.string().optional(),
  done: z.boolean().optional(),
  message: z.object({ content: z.string().optional() }).optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
});

export type OllamaChatChunk = z.infer<typeof ollamaChatChunkSchema>;

export const ollamaEmbeddingSchema = z.object({
  embedding: z.array(z.number()).optional(),
});

export const chatCompletionSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullish() }).optional(),
        delta: z.object({ content: z.string().nullish() }).optional(),
      }),
    )
    .optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional(),
});

export type ChatCompletionResponse = z.infer<typeof chatCompletionSchema>;

export const embeddingsResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()).optional() })).optional(),
});

/**
 * Parses one streamed frame, returning `undefined` for anything unparseable.
 * A malformed frame mid-stream should drop that frame, never kill the stream.
 */
export function parseStreamFrame<T>(schema: z.ZodType<T>, raw: string): T | undefined {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const result = schema.safeParse(json);
  return result.success ? result.data : undefined;
}
