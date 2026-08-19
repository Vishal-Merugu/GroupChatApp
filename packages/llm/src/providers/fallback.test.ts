import { describe, expect, it } from 'vitest';

import { LlmError, LlmRateLimitError, LlmUnavailableError } from '../errors';
import type {
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  EmbeddingResult,
  LlmProvider,
} from '../types';
import { FallbackProvider } from './fallback';

/** Minimal scripted provider — no network, no SDK. */
class StubProvider implements LlmProvider {
  public completeCalls = 0;
  public streamCalls = 0;

  constructor(
    public readonly name: string,
    private readonly behaviour:
      | { kind: 'ok'; content: string }
      | { kind: 'tokens'; tokens: string[] }
      | { kind: 'fail-after'; tokens: string[]; error: Error }
      | { kind: 'throw'; error: Error },
  ) {}

  public async complete(
    _messages: ChatMessage[],
    _options?: CompletionOptions,
  ): Promise<CompletionResult> {
    this.completeCalls += 1;
    if (this.behaviour.kind === 'throw') {
      throw this.behaviour.error;
    }
    if (this.behaviour.kind === 'ok') {
      return { content: this.behaviour.content, model: this.name };
    }
    return { content: '', model: this.name };
  }

  public async *stream(
    _messages: ChatMessage[],
    _options?: CompletionOptions,
  ): AsyncIterable<string> {
    this.streamCalls += 1;
    if (this.behaviour.kind === 'throw') {
      throw this.behaviour.error;
    }
    if (this.behaviour.kind === 'fail-after') {
      for (const token of this.behaviour.tokens) {
        yield token;
      }
      throw this.behaviour.error;
    }
    if (this.behaviour.kind === 'tokens') {
      for (const token of this.behaviour.tokens) {
        yield token;
      }
    }
  }

  public async embed(_text: string): Promise<EmbeddingResult> {
    if (this.behaviour.kind === 'throw') {
      throw this.behaviour.error;
    }
    return { embedding: [0], model: this.name };
  }
}

const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const tokens: string[] = [];
  for await (const token of stream) {
    tokens.push(token);
  }
  return tokens;
}

describe('FallbackProvider', () => {
  it('uses the first provider when it succeeds', async () => {
    const primary = new StubProvider('groq', { kind: 'ok', content: 'from primary' });
    const secondary = new StubProvider('ollama', { kind: 'ok', content: 'from secondary' });

    const result = await new FallbackProvider([primary, secondary]).complete(messages);

    expect(result.content).toBe('from primary');
    expect(secondary.completeCalls).toBe(0);
  });

  it('falls back to the next provider when the first is rate limited', async () => {
    const primary = new StubProvider('groq', {
      kind: 'throw',
      error: new LlmRateLimitError('groq', 'quota exhausted', 30),
    });
    const secondary = new StubProvider('ollama', { kind: 'ok', content: 'local answer' });

    const result = await new FallbackProvider([primary, secondary]).complete(messages);

    expect(result.content).toBe('local answer');
    expect(primary.completeCalls).toBe(1);
  });

  it('falls back when a provider is unreachable', async () => {
    const primary = new StubProvider('groq', {
      kind: 'throw',
      error: new LlmUnavailableError('groq', 'connection refused'),
    });
    const secondary = new StubProvider('ollama', { kind: 'ok', content: 'local answer' });

    const result = await new FallbackProvider([primary, secondary]).complete(messages);

    expect(result.content).toBe('local answer');
  });

  it('does not retry other providers on a non-recoverable error', async () => {
    const primary = new StubProvider('groq', {
      kind: 'throw',
      error: new LlmError('groq', 'malformed prompt'),
    });
    const secondary = new StubProvider('ollama', { kind: 'ok', content: 'local answer' });

    await expect(new FallbackProvider([primary, secondary]).complete(messages)).rejects.toThrow(
      'malformed prompt',
    );
    expect(secondary.completeCalls).toBe(0);
  });

  it('throws when every provider is exhausted', async () => {
    const primary = new StubProvider('groq', {
      kind: 'throw',
      error: new LlmRateLimitError('groq', 'quota exhausted'),
    });
    const secondary = new StubProvider('ollama', {
      kind: 'throw',
      error: new LlmUnavailableError('ollama', 'not running'),
    });

    await expect(new FallbackProvider([primary, secondary]).complete(messages)).rejects.toThrow(
      'all providers exhausted',
    );
  });

  it('switches backends when the first fails before emitting any token', async () => {
    const primary = new StubProvider('groq', {
      kind: 'throw',
      error: new LlmRateLimitError('groq', 'quota exhausted'),
    });
    const secondary = new StubProvider('ollama', { kind: 'tokens', tokens: ['he', 'llo'] });

    const tokens = await collect(new FallbackProvider([primary, secondary]).stream(messages));

    expect(tokens).toEqual(['he', 'llo']);
  });

  it('propagates a mid-stream failure rather than restarting the response', async () => {
    // Switching here would replay the answer from the top in the user's view.
    const primary = new StubProvider('groq', {
      kind: 'fail-after',
      tokens: ['par', 'tial'],
      error: new LlmRateLimitError('groq', 'quota exhausted mid-stream'),
    });
    const secondary = new StubProvider('ollama', { kind: 'tokens', tokens: ['full'] });

    const fallback = new FallbackProvider([primary, secondary]);
    const seen: string[] = [];

    await expect(async () => {
      for await (const token of fallback.stream(messages)) {
        seen.push(token);
      }
    }).rejects.toThrow('quota exhausted mid-stream');

    expect(seen).toEqual(['par', 'tial']);
    expect(secondary.streamCalls).toBe(0);
  });

  it('rejects an empty provider list', () => {
    expect(() => new FallbackProvider([])).toThrow('at least one provider is required');
  });
});
