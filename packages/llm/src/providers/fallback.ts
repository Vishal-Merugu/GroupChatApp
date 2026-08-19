import { LlmError, LlmRateLimitError, LlmUnavailableError } from '../errors';
import type {
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  EmbeddingResult,
  LlmProvider,
} from '../types';

/**
 * Tries each backend in order, moving on when one is throttled or unreachable.
 *
 * Decision 5: free tiers fail with 429s rather than a bill, so a single
 * provider's rate limit must not be a hard ceiling on the whole app. Only
 * rate-limit and unavailability errors trigger a fallback — a malformed prompt
 * would fail identically everywhere, so it propagates immediately instead of
 * burning every backend's quota.
 */
export class FallbackProvider implements LlmProvider {
  public readonly name: string;

  private readonly providers: readonly LlmProvider[];

  constructor(providers: readonly LlmProvider[]) {
    if (providers.length === 0) {
      throw new LlmError('fallback', 'at least one provider is required');
    }
    this.providers = providers;
    this.name = `fallback(${providers.map((p) => p.name).join(' -> ')})`;
  }

  public async complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    return this.attempt((provider) => provider.complete(messages, options));
  }

  public async embed(
    text: string,
    options?: { model?: string; signal?: AbortSignal },
  ): Promise<EmbeddingResult> {
    return this.attempt((provider) => provider.embed(text, options));
  }

  /**
   * Falls back only before the first token is emitted. Once a backend has
   * started streaming, switching would restart the response mid-sentence in the
   * user's view, so a mid-stream failure propagates instead.
   */
  public async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncIterable<string> {
    let lastError: unknown;

    for (const provider of this.providers) {
      let emitted = false;
      try {
        for await (const token of provider.stream(messages, options)) {
          emitted = true;
          yield token;
        }
        return;
      } catch (error) {
        if (emitted || !isRecoverable(error)) {
          throw error;
        }
        lastError = error;
      }
    }

    throw asExhaustedError(this.providers, lastError);
  }

  private async attempt<T>(run: (provider: LlmProvider) => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (const provider of this.providers) {
      try {
        return await run(provider);
      } catch (error) {
        if (!isRecoverable(error)) {
          throw error;
        }
        lastError = error;
      }
    }

    throw asExhaustedError(this.providers, lastError);
  }
}

function isRecoverable(error: unknown): boolean {
  return error instanceof LlmRateLimitError || error instanceof LlmUnavailableError;
}

function asExhaustedError(providers: readonly LlmProvider[], cause: unknown): LlmError {
  const names = providers.map((p) => p.name).join(', ');
  return new LlmUnavailableError('fallback', `all providers exhausted (${names})`, cause);
}
