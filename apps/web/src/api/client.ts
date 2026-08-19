import {
  apiErrorBodySchema,
  authResponseSchema,
  groupDetailSchema,
  groupSummaryListSchema,
  llmCredentialListSchema,
  llmCredentialSchema,
  llmCredentialTestResultSchema,
  messageListSchema,
  messageSchema,
  type ApiErrorBody,
  type ProviderKind,
} from '@groupchat/contracts';
import { z } from 'zod';

/** Carries the server's error envelope through to the UI. */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: Record<string, string[]>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details ?? {};
  }
}

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

/**
 * Single place every HTTP call goes through, so auth headers, the error
 * envelope, and response validation are handled once rather than per call site.
 *
 * The response is parsed with a schema rather than cast: a deployed client and
 * server drift out of sync during a rolling deploy, and a schema turns that into
 * one clear error instead of `undefined` surfacing somewhere in the UI.
 */
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  }

  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`/api${path}`, init);

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsedError = apiErrorBodySchema.safeParse(payload);
    throw new ApiError(
      response.status,
      parsedError.success
        ? parsedError.data
        : { error: { code: 'UNKNOWN', message: `Request failed with ${response.status}` } },
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(response.status, {
      error: {
        code: 'MALFORMED_RESPONSE',
        message: `Server returned an unexpected shape for ${path}`,
      },
    });
  }
  return parsed.data;
}

export const api = {
  signUp: (input: { name: string; email: string; phone: string; password: string }) =>
    request('/auth/signup', authResponseSchema, { method: 'POST', body: input }),

  login: (input: { email: string; password: string }) =>
    request('/auth/login', authResponseSchema, { method: 'POST', body: input }),

  listGroups: () => request('/groups', groupSummaryListSchema),

  createGroup: (input: { name: string; members: string[]; admins: string[] }) =>
    request('/groups', groupDetailSchema, { method: 'POST', body: input }),

  getGroup: (groupId: number) => request(`/groups/${groupId}`, groupDetailSchema),

  listMessages: (groupId: number, afterId?: number) =>
    request(
      `/groups/${groupId}/messages${afterId === undefined ? '' : `?afterId=${afterId}`}`,
      messageListSchema,
    ),

  sendMessage: (groupId: number, body: string) =>
    request(`/groups/${groupId}/messages`, messageSchema, { method: 'POST', body: { body } }),

  listLlmCredentials: () => request('/llm-credentials', llmCredentialListSchema),

  createLlmCredential: (input: {
    provider: ProviderKind;
    label: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
  }) => request('/llm-credentials', llmCredentialSchema, { method: 'POST', body: input }),

  updateLlmCredential: (
    credentialId: number,
    input: Partial<{ label: string; model: string; apiKey: string; baseUrl: string; enabled: boolean }>,
  ) =>
    request(`/llm-credentials/${credentialId}`, llmCredentialSchema, {
      method: 'PUT',
      body: input,
    }),

  deleteLlmCredential: (credentialId: number) =>
    request(`/llm-credentials/${credentialId}`, z.undefined(), { method: 'DELETE' }),

  reorderLlmCredentials: (orderedIds: number[]) =>
    request('/llm-credentials/reorder', llmCredentialListSchema, {
      method: 'POST',
      body: { orderedIds },
    }),

  testLlmCredential: (credentialId: number) =>
    request(`/llm-credentials/${credentialId}/test`, llmCredentialTestResultSchema, {
      method: 'POST',
      body: {},
    }),
};
