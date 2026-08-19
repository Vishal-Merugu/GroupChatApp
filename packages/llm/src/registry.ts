import type { ProviderKind } from '@groupchat/contracts';

/**
 * Known OpenAI-compatible free/hosted backends. Every one of these speaks the
 * same `chat/completions` + `embeddings` dialect, so onboarding a new one is a
 * registry entry, never a new provider class — that is the whole point of
 * Decision 7's generic interface.
 */
export interface ProviderPreset {
  kind: ProviderKind;
  label: string;
  /** Fixed base URL. Absent when the user must supply their own. */
  baseUrl?: string;
  /** True when the user must supply a base URL (account-specific or fully custom). */
  requiresBaseUrl: boolean;
  /** True when no API key is needed (local Ollama). */
  requiresApiKey: boolean;
  helpUrl?: string;
}

export const PROVIDER_PRESETS: Record<ProviderKind, ProviderPreset> = {
  ollama: {
    kind: 'ollama',
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434',
    requiresBaseUrl: false,
    requiresApiKey: false,
  },
  openrouter: {
    kind: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    requiresBaseUrl: false,
    requiresApiKey: true,
    helpUrl: 'https://openrouter.ai/keys',
  },
  groq: {
    kind: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    requiresBaseUrl: false,
    requiresApiKey: true,
    helpUrl: 'https://console.groq.com/keys',
  },
  gemini: {
    kind: 'gemini',
    label: 'Google Gemini',
    // Google's OpenAI-compatibility layer, not the native Gemini REST API.
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    requiresBaseUrl: false,
    requiresApiKey: true,
    helpUrl: 'https://aistudio.google.com/apikey',
  },
  cloudflare: {
    kind: 'cloudflare',
    label: 'Cloudflare Workers AI',
    // The base URL embeds the account id, so it cannot be a fixed constant:
    // https://api.cloudflare.com/client/v4/accounts/<account-id>/ai/v1
    requiresBaseUrl: true,
    requiresApiKey: true,
    helpUrl: 'https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/',
  },
  custom: {
    kind: 'custom',
    label: 'Custom (OpenAI-compatible)',
    requiresBaseUrl: true,
    requiresApiKey: true,
  },
};
