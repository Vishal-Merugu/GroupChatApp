import { LlmError, LlmRateLimitError, LlmUnavailableError } from '../errors';
import { ollamaChatChunkSchema, ollamaEmbeddingSchema, parseStreamFrame } from '../schemas';
import type {
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  EmbeddingResult,
  LlmProvider,
} from '../types';

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  embeddingModel?: string;
}

/**
 * Local Ollama backend — the development default. No API key, no rate limit,
 * unlimited iteration (spec section 10).
 */
export class OllamaProvider implements LlmProvider {
  public readonly name = 'ollama';

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly embeddingModel: string;

  constructor(config: OllamaConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.model = config.model;
    this.embeddingModel = config.embeddingModel ?? 'nomic-embed-text';
  }

  public async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {},
  ): Promise<CompletionResult> {
    const model = options.model ?? this.model;
    const response = await this.post(
      '/api/chat',
      { model, messages, stream: false, options: buildOllamaOptions(options) },
      options.signal,
    );

    const chunk = ollamaChatChunkSchema.parse(await response.json());
    const result: CompletionResult = {
      content: chunk.message?.content ?? '',
      model: chunk.model ?? model,
    };
    if (chunk.prompt_eval_count !== undefined && chunk.eval_count !== undefined) {
      result.usage = { promptTokens: chunk.prompt_eval_count, completionTokens: chunk.eval_count };
    }
    return result;
  }

  public async *stream(
    messages: ChatMessage[],
    options: CompletionOptions = {},
  ): AsyncIterable<string> {
    const response = await this.post(
      '/api/chat',
      {
        model: options.model ?? this.model,
        messages,
        stream: true,
        options: buildOllamaOptions(options),
      },
      options.signal,
    );

    // Ollama streams newline-delimited JSON, one object per token batch.
    for await (const line of iterateLines(response)) {
      const chunk = parseStreamFrame(ollamaChatChunkSchema, line);
      if (!chunk) {
        continue;
      }
      if (chunk.message?.content) {
        yield chunk.message.content;
      }
      if (chunk.done) {
        return;
      }
    }
  }

  public async embed(
    text: string,
    options: { model?: string; signal?: AbortSignal } = {},
  ): Promise<EmbeddingResult> {
    const model = options.model ?? this.embeddingModel;
    const response = await this.post('/api/embeddings', { model, prompt: text }, options.signal);
    const parsed = ollamaEmbeddingSchema.parse(await response.json());
    if (!parsed.embedding) {
      throw new LlmError(this.name, 'embedding response contained no vector');
    }
    return { embedding: parsed.embedding, model };
  }

  private async post(path: string, payload: unknown, signal?: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      const init: RequestInit = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      };
      if (signal) {
        init.signal = signal;
      }
      response = await fetch(`${this.baseUrl}${path}`, init);
    } catch (error) {
      // Connection refused is the common case: Ollama simply isn't running.
      throw new LlmUnavailableError(this.name, `could not reach ${this.baseUrl}`, error);
    }

    if (response.status === 429) {
      throw new LlmRateLimitError(this.name, 'rate limited');
    }
    if (!response.ok) {
      throw new LlmError(
        this.name,
        `${path} failed with ${response.status}: ${await safeText(response)}`,
      );
    }
    return response;
  }
}

function buildOllamaOptions(options: CompletionOptions): Record<string, number> {
  const result: Record<string, number> = {};
  if (options.temperature !== undefined) {
    result.temperature = options.temperature;
  }
  if (options.maxTokens !== undefined) {
    result.num_predict = options.maxTokens;
  }
  return result;
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '<unreadable body>';
  }
}

/**
 * The slice of the streaming-body API this module actually uses.
 *
 * Written out locally because the ambient `ReadableStream` typing available
 * here surfaces chunks as `any`, and Decision 8 rules out letting that spread
 * into the parsing code. A guard narrows to it rather than a cast asserting it.
 */
interface ByteStreamReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  releaseLock(): void;
}

interface ByteStream {
  getReader(): ByteStreamReader;
}

function isByteStream(body: unknown): body is ByteStream {
  return (
    typeof body === 'object' &&
    body !== null &&
    'getReader' in body &&
    typeof body.getReader === 'function'
  );
}

/**
 * Splits a streaming response body into complete lines, tolerating chunk
 * boundaries that fall mid-line. Both the newline-delimited JSON that Ollama
 * emits and the SSE frames from OpenAI-compatible providers are line-oriented,
 * so both stream readers share this.
 */
export async function* iterateLines(response: Response): AsyncIterable<string> {
  // Read through `unknown` first: `response.body` is already typed as
  // `ReadableStream<any>`, and narrowing an `any`-parameterised type only
  // intersects with it, leaving chunks `any`. Starting from `unknown` makes the
  // guard the sole source of the type.
  const body: unknown = response.body;
  if (!isByteStream(body)) {
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          yield line;
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }
  } finally {
    reader.releaseLock();
  }

  const tail = buffer.trim();
  if (tail.length > 0) {
    yield tail;
  }
}
