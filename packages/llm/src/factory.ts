import type { ProviderKind } from '@groupchat/contracts';

import { LlmConfigurationError } from './errors';
import { FallbackProvider } from './providers/fallback';
import { OllamaProvider } from './providers/ollama';
import { OpenAiCompatibleProvider } from './providers/openai-compatible';
import { PROVIDER_PRESETS } from './registry';
import type { LlmProvider } from './types';

/**
 * One configured credential — the shape a database row (or an env var set)
 * gets mapped to before it becomes a live provider. Deliberately not a zod
 * schema: reading and validating stored config is the application's job, not
 * this package's, and composing schemas across a package boundary breaks
 * whenever the two sides resolve a different copy of zod.
 */
export interface CredentialConfig {
  kind: ProviderKind;
  model: string;
  /** Required unless `kind` is `ollama`. */
  apiKey?: string;
  /** Overrides the preset base URL; required for `cloudflare` and `custom`. */
  baseUrl?: string;
  embeddingModel?: string;
}

function toProvider(config: CredentialConfig): LlmProvider {
  const preset = PROVIDER_PRESETS[config.kind];
  const baseUrl = config.baseUrl ?? preset.baseUrl;

  if (!baseUrl) {
    throw new LlmConfigurationError(config.kind, 'a base URL is required for this provider');
  }

  if (config.kind === 'ollama') {
    return new OllamaProvider({
      baseUrl,
      model: config.model,
      ...(config.embeddingModel ? { embeddingModel: config.embeddingModel } : {}),
    });
  }

  if (preset.requiresApiKey && !config.apiKey) {
    throw new LlmConfigurationError(config.kind, 'an API key is required for this provider');
  }

  return new OpenAiCompatibleProvider({
    baseUrl,
    apiKey: config.apiKey ?? '',
    model: config.model,
    name: config.kind,
    ...(config.embeddingModel ? { embeddingModel: config.embeddingModel } : {}),
  });
}

/**
 * Builds a waterfall from an ordered list of credentials — try the first, and
 * on a rate-limit or unavailable error fall through to the next, exactly as
 * `FallbackProvider` already does. This is the mechanism behind letting a user
 * register several free-tier keys (Gemini, Groq, OpenRouter, Cloudflare, a
 * local Ollama, ...) so one provider's quota is never a hard ceiling.
 *
 * Order matters: index 0 is tried first. Callers order credentials by their
 * own `priority` field before calling this.
 */
export function buildProviderChain(configs: readonly CredentialConfig[]): LlmProvider {
  if (configs.length === 0) {
    throw new LlmConfigurationError('chain', 'at least one credential is required');
  }

  const providers = configs.map(toProvider);
  const [only] = providers;
  return providers.length === 1 && only ? only : new FallbackProvider(providers);
}

/** Back-compat single-credential config, still used by the server's env-driven default. */
export interface LlmConfig {
  provider: 'ollama' | 'openai-compatible';
  model: string;
  embeddingModel?: string;
  ollamaBaseUrl: string;
  /** Required when `provider` is `openai-compatible`. */
  baseUrl?: string;
  apiKey?: string;
}

/**
 * Builds a single default provider from env-style config — used when a user
 * has no credentials of their own configured yet. When a hosted provider is
 * set, local Ollama is appended as a fallback.
 */
export function createLlmProvider(config: LlmConfig): LlmProvider {
  const ollama: CredentialConfig = {
    kind: 'ollama',
    model: config.model,
    baseUrl: config.ollamaBaseUrl,
    ...(config.embeddingModel ? { embeddingModel: config.embeddingModel } : {}),
  };

  if (config.provider === 'ollama') {
    return buildProviderChain([ollama]);
  }

  if (!config.baseUrl || !config.apiKey) {
    throw new LlmConfigurationError(
      'openai-compatible',
      'baseUrl and apiKey are required when provider is "openai-compatible"',
    );
  }

  const hosted: CredentialConfig = {
    kind: 'custom',
    model: config.model,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    ...(config.embeddingModel ? { embeddingModel: config.embeddingModel } : {}),
  };

  return buildProviderChain([hosted, ollama]);
}
