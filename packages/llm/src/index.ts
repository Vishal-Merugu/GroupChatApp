export type {
  ChatMessage,
  ChatRole,
  CompletionOptions,
  CompletionResult,
  EmbeddingResult,
  LlmProvider,
} from './types';

export {
  LlmError,
  LlmConfigurationError,
  LlmRateLimitError,
  LlmUnavailableError,
} from './errors';

export { OllamaProvider, type OllamaConfig } from './providers/ollama';
export {
  OpenAiCompatibleProvider,
  type OpenAiCompatibleConfig,
} from './providers/openai-compatible';
export { FallbackProvider } from './providers/fallback';
export {
  buildProviderChain,
  createLlmProvider,
  type CredentialConfig,
  type LlmConfig,
} from './factory';
export { PROVIDER_PRESETS, type ProviderPreset } from './registry';
