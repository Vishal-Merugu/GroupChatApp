import type { LlmCredential as LlmCredentialDto } from '@groupchat/contracts';
import {
  buildProviderChain,
  createLlmProvider,
  FallbackProvider,
  PROVIDER_PRESETS,
  type CredentialConfig,
  type LlmProvider,
} from '@groupchat/llm';

import { getEnv, toLlmConfig } from '../../config/env';
import { getSequelize } from '../../db/sequelize';
import { NotFoundError, ValidationError } from '../../errors/app-error';
import { LlmCredential } from '../../models/llm-credential';
import { decryptSecret, encryptSecret, maskSecret } from '../../services/crypto.service';
import { assertPublicHttpsUrl } from '../../utils/url-safety';
import type { CreateLlmCredentialInput, UpdateLlmCredentialInput } from './llm-credential.schemas';

function toDto(credential: LlmCredential): LlmCredentialDto {
  return {
    id: credential.id,
    provider: credential.provider,
    label: credential.label,
    model: credential.model,
    baseUrl: credential.baseUrl,
    maskedApiKey: credential.maskedApiKey,
    priority: credential.priority,
    enabled: credential.enabled,
  };
}

/** Validates a base URL against SSRF before it is ever persisted, when one is supplied. */
async function validateBaseUrlIfPresent(baseUrl: string | undefined): Promise<void> {
  if (baseUrl) {
    await assertPublicHttpsUrl(baseUrl);
  }
}

/**
 * Re-checks per-provider requirements the service itself, not only the zod
 * schema at the controller boundary. `apiKey`/`baseUrl` are typed optional on
 * `CreateLlmCredentialInput` even though the schema's `superRefine` makes them
 * conditionally required — that refinement only runs on `.parse()`, so a
 * direct service call (or a future caller that skips the controller) would
 * otherwise persist a credential broken from the moment it's saved.
 */
function assertProviderRequirementsMet(input: CreateLlmCredentialInput): void {
  const preset = PROVIDER_PRESETS[input.provider];
  if (preset.requiresApiKey && !input.apiKey) {
    throw new ValidationError(`${preset.label} requires an API key`);
  }
  if (preset.requiresBaseUrl && !input.baseUrl) {
    throw new ValidationError(`${preset.label} requires a base URL`);
  }
  assertNoOllamaBaseUrl(input.provider, input.baseUrl);
}

/**
 * Ollama always uses the server's own local instance. Accepting a per-user
 * baseUrl for it would be an SSRF hole with no HTTPS requirement to catch it —
 * `OllamaProvider` doesn't enforce HTTPS the way `OpenAiCompatibleProvider`
 * does, since talking to `localhost:11434` in plain HTTP is the normal case.
 * Checked here too, not just in the create schema, so `updateCredential`
 * cannot be used to attach a baseUrl to an existing ollama credential.
 */
function assertNoOllamaBaseUrl(provider: CreateLlmCredentialInput['provider'], baseUrl: string | undefined): void {
  if (provider === 'ollama' && baseUrl) {
    throw new ValidationError(
      'Ollama always uses the server’s local instance and does not accept a custom base URL',
    );
  }
}

export async function listCredentials(userId: number): Promise<LlmCredentialDto[]> {
  const rows = await LlmCredential.findAll({ where: { userId }, order: [['priority', 'ASC']] });
  return rows.map(toDto);
}

async function loadOwned(userId: number, credentialId: number): Promise<LlmCredential> {
  const credential = await LlmCredential.findOne({ where: { id: credentialId, userId } });
  if (!credential) {
    // 404, not 403 — consistent with the group/message ownership checks
    // elsewhere: a caller should not learn that another user's row exists.
    throw new NotFoundError('AI provider credential');
  }
  return credential;
}

export async function createCredential(
  userId: number,
  input: CreateLlmCredentialInput,
): Promise<LlmCredentialDto> {
  assertProviderRequirementsMet(input);
  await validateBaseUrlIfPresent(input.baseUrl);

  const sequelize = getSequelize();
  return sequelize.transaction(async (transaction) => {
    const highest = await LlmCredential.max<number | null, LlmCredential>('priority', {
      where: { userId },
      transaction,
    });

    const credential = await LlmCredential.create(
      {
        userId,
        provider: input.provider,
        label: input.label,
        model: input.model,
        baseUrl: input.baseUrl ?? null,
        encryptedApiKey: input.apiKey ? encryptSecret(input.apiKey) : null,
        maskedApiKey: input.apiKey ? maskSecret(input.apiKey) : null,
        priority: (highest ?? -1) + 1,
        enabled: true,
      },
      { transaction },
    );

    return toDto(credential);
  });
}

export async function updateCredential(
  userId: number,
  credentialId: number,
  input: UpdateLlmCredentialInput,
): Promise<LlmCredentialDto> {
  const credential = await loadOwned(userId, credentialId);
  assertNoOllamaBaseUrl(credential.provider, input.baseUrl);
  await validateBaseUrlIfPresent(input.baseUrl);

  const changes: Partial<
    Pick<LlmCredential, 'label' | 'model' | 'baseUrl' | 'enabled' | 'encryptedApiKey' | 'maskedApiKey'>
  > = {};
  if (input.label !== undefined) changes.label = input.label;
  if (input.model !== undefined) changes.model = input.model;
  if (input.baseUrl !== undefined) changes.baseUrl = input.baseUrl;
  if (input.enabled !== undefined) changes.enabled = input.enabled;
  if (input.apiKey !== undefined) {
    changes.encryptedApiKey = encryptSecret(input.apiKey);
    changes.maskedApiKey = maskSecret(input.apiKey);
  }

  await credential.update(changes);
  return toDto(credential);
}

export async function deleteCredential(userId: number, credentialId: number): Promise<void> {
  const credential = await loadOwned(userId, credentialId);
  await credential.destroy();
}

/**
 * Reassigns priorities from a client-submitted order.
 *
 * Applied in two passes inside one transaction — first every row moves to a
 * negative placeholder, then to its final value — because `(userId, priority)`
 * is uniquely indexed and writing final values directly can collide with
 * another row's still-current priority mid-loop (e.g. swapping 1 and 2).
 */
export async function reorderCredentials(
  userId: number,
  orderedIds: number[],
): Promise<LlmCredentialDto[]> {
  const sequelize = getSequelize();

  await sequelize.transaction(async (transaction) => {
    const owned = await LlmCredential.findAll({ where: { userId }, transaction });
    const ownedIds = new Set(owned.map((row) => row.id));

    if (orderedIds.length !== owned.length || orderedIds.some((id) => !ownedIds.has(id))) {
      throw new ValidationError('orderedIds must list every credential exactly once');
    }

    for (const [index, id] of orderedIds.entries()) {
      await LlmCredential.update(
        { priority: -(index + 1) },
        { where: { id, userId }, transaction },
      );
    }
    for (const [index, id] of orderedIds.entries()) {
      await LlmCredential.update({ priority: index }, { where: { id, userId }, transaction });
    }
  });

  return listCredentials(userId);
}

/**
 * Builds the live waterfall for a user: their own enabled credentials, lowest
 * priority first, with the server's own env-configured default (`LLM_PROVIDER`
 * etc.) appended last. This is the seam Stage F–H will call: every AI feature
 * asks for "this user's provider chain" and never touches a credential row
 * directly.
 *
 * The server default exists so a brand-new user with no credentials of their
 * own yet still gets *something* — normally local Ollama — rather than a hard
 * wall until they visit settings. Their own keys are always tried first.
 */
export async function getProviderChainForUser(userId: number): Promise<LlmProvider> {
  const rows = await LlmCredential.findAll({
    where: { userId, enabled: true },
    order: [['priority', 'ASC']],
  });

  const configs: CredentialConfig[] = rows.map((row) => ({
    kind: row.provider,
    model: row.model,
    ...(row.baseUrl ? { baseUrl: row.baseUrl } : {}),
    ...(row.encryptedApiKey ? { apiKey: decryptSecret(row.encryptedApiKey) } : {}),
  }));

  const userChain = configs.length > 0 ? buildProviderChain(configs) : null;
  const serverDefault = buildServerDefaultProvider();

  if (userChain && serverDefault) {
    return new FallbackProvider([userChain, serverDefault]);
  }
  if (userChain) {
    return userChain;
  }
  if (serverDefault) {
    return serverDefault;
  }
  throw new ValidationError(
    'No AI providers configured. Add an API key in AI provider settings first.',
  );
}

/**
 * The operator's own configured default, from `LLM_PROVIDER`/`LLM_MODEL`/etc.
 * A misconfigured server default (e.g. `openai-compatible` with no API key)
 * must not block users who *do* have their own working credentials — so a
 * broken default is swallowed here rather than thrown, and simply omitted
 * from the chain.
 */
function buildServerDefaultProvider(): LlmProvider | null {
  try {
    return createLlmProvider(toLlmConfig(getEnv()));
  } catch {
    return null;
  }
}

/** Verifies one credential actually works by making a trivial completion call. */
export async function testCredential(
  userId: number,
  credentialId: number,
  prompt: string,
): Promise<{ ok: boolean; message: string; sample?: string }> {
  const credential = await loadOwned(userId, credentialId);

  const preset = PROVIDER_PRESETS[credential.provider];
  const config: CredentialConfig = {
    kind: credential.provider,
    model: credential.model,
    ...(credential.baseUrl ? { baseUrl: credential.baseUrl } : {}),
    ...(credential.encryptedApiKey
      ? { apiKey: decryptSecret(credential.encryptedApiKey) }
      : {}),
  };

  try {
    const provider = buildProviderChain([config]);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const result = await provider.complete([{ role: 'user', content: prompt }], {
        signal: controller.signal,
        maxTokens: 32,
      });
      return { ok: true, message: `${preset.label} responded successfully`, sample: result.content };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return { ok: false, message: describeTestFailure(error) };
  }
}

function describeTestFailure(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'The provider did not respond';
}
