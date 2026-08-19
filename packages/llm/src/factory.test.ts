import { describe, expect, it } from 'vitest';

import { LlmConfigurationError } from './errors';
import { buildProviderChain } from './factory';
import { FallbackProvider } from './providers/fallback';
import { OllamaProvider } from './providers/ollama';
import { OpenAiCompatibleProvider } from './providers/openai-compatible';

describe('buildProviderChain', () => {
  it('rejects an empty credential list', () => {
    expect(() => buildProviderChain([])).toThrow('at least one credential is required');
  });

  it('returns a bare provider for a single credential, not a fallback wrapper', () => {
    const chain = buildProviderChain([{ kind: 'ollama', model: 'llama3.1' }]);

    expect(chain).toBeInstanceOf(OllamaProvider);
  });

  it('wraps multiple credentials in a FallbackProvider, in the given order', () => {
    const chain = buildProviderChain([
      { kind: 'groq', model: 'llama-3.3-70b-versatile', apiKey: 'gsk_test' },
      { kind: 'ollama', model: 'llama3.1' },
    ]);

    expect(chain).toBeInstanceOf(FallbackProvider);
    expect(chain.name).toBe('fallback(groq -> ollama)');
  });

  it('builds ollama without requiring an API key', () => {
    expect(() => buildProviderChain([{ kind: 'ollama', model: 'llama3.1' }])).not.toThrow();
  });

  it('rejects a hosted provider with no API key', () => {
    expect(() => buildProviderChain([{ kind: 'groq', model: 'llama3' }])).toThrow(
      LlmConfigurationError,
    );
  });

  it('rejects cloudflare/custom with no base URL', () => {
    expect(() =>
      buildProviderChain([{ kind: 'cloudflare', model: 'llama3', apiKey: 'x' }]),
    ).toThrow('base URL is required');
    expect(() =>
      buildProviderChain([{ kind: 'custom', model: 'llama3', apiKey: 'x' }]),
    ).toThrow('base URL is required');
  });

  it('uses a preset base URL when the credential does not override it', () => {
    const chain = buildProviderChain([
      { kind: 'groq', model: 'llama3', apiKey: 'gsk_test' },
    ]);

    expect(chain).toBeInstanceOf(OpenAiCompatibleProvider);
    expect(chain.name).toBe('groq');
  });

  it('lets a credential override the preset base URL', () => {
    // Cloudflare's URL embeds an account id, so it cannot be a fixed constant.
    const chain = buildProviderChain([
      {
        kind: 'cloudflare',
        model: '@cf/meta/llama-3.1-8b-instruct',
        apiKey: 'cf_test',
        baseUrl: 'https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1',
      },
    ]);

    expect(chain).toBeInstanceOf(OpenAiCompatibleProvider);
  });
});
