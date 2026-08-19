import 'dotenv/config';

import type { LlmConfig } from '@groupchat/llm';
import { z } from 'zod';

/**
 * Validated once at boot. The old codebase read `process.env` ad hoc at call
 * sites, so a missing `JWT_SECRET_KEY` surfaced as a confusing runtime failure
 * inside a request. Parsing here means a misconfigured deploy fails to start.
 */
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    APP_BASE_URL: z.string().url().default('http://localhost:3000'),

    DB_HOST: z.string().min(1).default('localhost'),
    DB_PORT: z.coerce.number().int().positive().default(54322),
    DB_NAME: z.string().min(1).default('groupchat'),
    DB_USERNAME: z.string().min(1).default('postgres'),
    DB_PASSWORD: z.string().default('postgres'),
    // Applies model changes to the database at boot. On by default — there is
    // no data to protect yet. Turn off once there is.
    DB_SYNC: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    // Most hosted Postgres (Render, Neon, Supabase) requires TLS; local Docker
    // does not offer it.
    DB_SSL: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

    JWT_SECRET_KEY: z.string().min(16, 'JWT_SECRET_KEY must be at least 16 characters'),
    JWT_EXPIRES_IN: z.string().default('7d'),

    // Encrypts user-supplied LLM API keys at rest (AES-256-GCM). Generate with
    // `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
    CREDENTIAL_ENCRYPTION_KEY: z
      .string()
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        message: 'CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
      }),

    BUCKET_NAME: z.string().optional(),
    IAM_ACCESS_KEY: z.string().optional(),
    IAM_SECRET_KEY: z.string().optional(),
    AWS_REGION: z.string().default('eu-central-1'),

    SIB_API_KEY: z.string().optional(),
    MAIL_SENDER_EMAIL: z.string().email().default('no-reply@groupchat.local'),
    MAIL_SENDER_NAME: z.string().default('GroupChat'),

    // LLM layer (Phase 2). Validated here rather than inside @groupchat/llm —
    // reading the environment is the application's job, not the package's.
    LLM_PROVIDER: z.enum(['ollama', 'openai-compatible']).default('ollama'),
    LLM_MODEL: z.string().min(1).default('llama3.1'),
    LLM_EMBEDDING_MODEL: z.string().min(1).optional(),
    OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
    LLM_BASE_URL: z.string().url().optional(),
    LLM_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Projects the validated environment onto the LLM package's config shape. */
export function toLlmConfig(env: Env): LlmConfig {
  return {
    provider: env.LLM_PROVIDER,
    model: env.LLM_MODEL,
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    ...(env.LLM_EMBEDDING_MODEL ? { embeddingModel: env.LLM_EMBEDDING_MODEL } : {}),
    ...(env.LLM_BASE_URL ? { baseUrl: env.LLM_BASE_URL } : {}),
    ...(env.LLM_API_KEY ? { apiKey: env.LLM_API_KEY } : {}),
  };
}

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export function getEnv(): Env {
  cached ??= loadEnv();
  return cached;
}
