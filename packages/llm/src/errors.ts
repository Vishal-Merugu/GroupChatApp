/**
 * Errors thrown by the LLM layer. Callers distinguish `LlmRateLimitError` from a
 * generic failure because rate limiting is the *expected* steady state on free
 * tiers (Decision 5) and should trigger fallback, not an alarm.
 */
export class LlmError extends Error {
  public readonly provider: string;
  public override readonly cause?: unknown;

  constructor(provider: string, message: string, cause?: unknown) {
    super(`[${provider}] ${message}`);
    this.name = new.target.name;
    this.provider = provider;
    this.cause = cause;
  }
}

export class LlmRateLimitError extends LlmError {
  /** Seconds to wait before retrying, when the provider reports it. */
  public readonly retryAfterSeconds?: number;

  constructor(provider: string, message: string, retryAfterSeconds?: number) {
    super(provider, message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class LlmUnavailableError extends LlmError {}

export class LlmConfigurationError extends LlmError {}
