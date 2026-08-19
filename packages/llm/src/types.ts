/**
 * The generic LLM contract. Application code depends on THIS and nothing else —
 * no provider SDK is ever imported outside `src/providers/`. See spec Decision 7:
 * free-tier models and rate limits rotate without notice, so the provider has to
 * stay swappable at runtime.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface CompletionOptions {
  /** Overrides the provider's configured default model. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Aborts an in-flight request — wired to the client disconnecting. */
  signal?: AbortSignal;
}

export interface CompletionResult {
  content: string;
  model: string;
  /** Providers that do not report usage leave this undefined. */
  usage?: { promptTokens: number; completionTokens: number };
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
}

export interface LlmProvider {
  /** Stable identifier used in logs and error messages, e.g. `ollama`. */
  readonly name: string;

  /** Blocking completion. Use for background work that has no UI waiting on it. */
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;

  /**
   * Token-by-token completion. Every user-facing AI surface uses this so the UI
   * renders progressively instead of showing a frozen spinner.
   */
  stream(messages: ChatMessage[], options?: CompletionOptions): AsyncIterable<string>;

  /** Embeds a single chunk of text for the pgvector index (Stage E). */
  embed(text: string, options?: { model?: string; signal?: AbortSignal }): Promise<EmbeddingResult>;
}
