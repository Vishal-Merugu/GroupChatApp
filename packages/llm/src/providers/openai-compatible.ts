import { LlmConfigurationError, LlmError, LlmRateLimitError, LlmUnavailableError } from '../errors';
import {
  chatCompletionSchema,
  embeddingsResponseSchema,
  parseStreamFrame,
} from '../schemas';
import type {
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  EmbeddingResult,
  LlmProvider,
} from '../types';
import { iterateLines } from './ollama';

export interface OpenAiCompatibleConfig {
  /** e.g. `https://api.groq.com/openai/v1` or an OpenRouter base URL. */
  baseUrl: string;
  apiKey: string;
  model: string;
  embeddingModel?: string;
  /** Reported in logs so the hosted backends stay distinguishable. */
  name?: string;
}

/**
 * Any provider speaking the OpenAI chat-completions dialect — Groq and
 * OpenRouter free tiers both do. Used where a deployed demo must be reachable
 * without a local machine running.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  public readonly name: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly embeddingModel: string;

  constructor(config: OpenAiCompatibleConfig) {
    if (!config.apiKey) {
      throw new LlmConfigurationError(config.name ?? 'openai-compatible', 'apiKey is required');
    }
    this.name = config.name ?? 'openai-compatible';
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.embeddingModel = config.embeddingModel ?? config.model;
  }

  public async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {},
  ): Promise<CompletionResult> {
    const model = options.model ?? this.model;
    const response = await this.post(
      '/chat/completions',
      { model, messages, stream: false, ...optionalParams(options) },
      options.signal,
    );

    const parsed = chatCompletionSchema.parse(await response.json());
    const result: CompletionResult = {
      content: parsed.choices?.[0]?.message?.content ?? '',
      model: parsed.model ?? model,
    };
    const promptTokens = parsed.usage?.prompt_tokens;
    const completionTokens = parsed.usage?.completion_tokens;
    if (promptTokens !== undefined && completionTokens !== undefined) {
      result.usage = { promptTokens, completionTokens };
    }
    return result;
  }

  public async *stream(
    messages: ChatMessage[],
    options: CompletionOptions = {},
  ): AsyncIterable<string> {
    const response = await this.post(
      '/chat/completions',
      {
        model: options.model ?? this.model,
        messages,
        stream: true,
        ...optionalParams(options),
      },
      options.signal,
    );

    // Server-sent events: `data: {...}` frames, terminated by `data: [DONE]`.
    for await (const line of iterateLines(response)) {
      if (!line.startsWith('data:')) {
        continue;
      }
      const payload = line.slice('data:'.length).trim();
      if (payload === '[DONE]') {
        return;
      }
      const parsed = parseStreamFrame(chatCompletionSchema, payload);
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }

  public async embed(
    text: string,
    options: { model?: string; signal?: AbortSignal } = {},
  ): Promise<EmbeddingResult> {
    const model = options.model ?? this.embeddingModel;
    const response = await this.post('/embeddings', { model, input: text }, options.signal);
    const parsed = embeddingsResponseSchema.parse(await response.json());
    const embedding = parsed.data?.[0]?.embedding;
    if (!embedding) {
      throw new LlmError(this.name, 'embedding response contained no vector');
    }
    return { embedding, model };
  }

  private async post(path: string, payload: unknown, signal?: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      const init: RequestInit = {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      };
      if (signal) {
        init.signal = signal;
      }
      response = await fetch(`${this.baseUrl}${path}`, init);
    } catch (error) {
      throw new LlmUnavailableError(this.name, `could not reach ${this.baseUrl}`, error);
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new LlmRateLimitError(
        this.name,
        'rate limited — free tier quota exhausted',
        Number.isFinite(retryAfter) ? retryAfter : undefined,
      );
    }
    if (!response.ok) {
      throw new LlmError(this.name, `${path} failed with ${response.status}`);
    }
    return response;
  }
}

function optionalParams(options: CompletionOptions): Record<string, number> {
  const params: Record<string, number> = {};
  if (options.temperature !== undefined) {
    params.temperature = options.temperature;
  }
  if (options.maxTokens !== undefined) {
    params.max_tokens = options.maxTokens;
  }
  return params;
}
