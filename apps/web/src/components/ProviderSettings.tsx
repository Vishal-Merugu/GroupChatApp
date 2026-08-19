import { PROVIDER_KINDS, type LlmCredential, type ProviderKind } from '@groupchat/contracts';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { ApiError, api } from '../api/client';

/**
 * Display metadata only — requirements (needs a base URL? needs a key?) are
 * enforced server-side from `@groupchat/llm`'s registry, the single source of
 * truth. This just decides which form fields to show.
 */
const PROVIDER_INFO: Record<ProviderKind, { label: string; needsBaseUrl: boolean; needsKey: boolean; help?: string }> = {
  ollama: { label: 'Ollama (local)', needsBaseUrl: false, needsKey: false },
  groq: { label: 'Groq', needsBaseUrl: false, needsKey: true, help: 'console.groq.com/keys' },
  openrouter: { label: 'OpenRouter', needsBaseUrl: false, needsKey: true, help: 'openrouter.ai/keys' },
  gemini: { label: 'Google Gemini', needsBaseUrl: false, needsKey: true, help: 'aistudio.google.com/apikey' },
  cloudflare: {
    label: 'Cloudflare Workers AI',
    needsBaseUrl: true,
    needsKey: true,
    help: 'base URL includes your account id',
  },
  custom: { label: 'Custom (OpenAI-compatible)', needsBaseUrl: true, needsKey: true },
};

interface ProviderSettingsProps {
  onClose: () => void;
}

export function ProviderSettings({ onClose }: ProviderSettingsProps): JSX.Element {
  const [credentials, setCredentials] = useState<LlmCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; message: string }>>(
    {},
  );
  const [testing, setTesting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCredentials(await api.listLlmCredentials());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(credentialId: number, direction: -1 | 1): Promise<void> {
    const index = credentials.findIndex((c) => c.id === credentialId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= credentials.length) {
      return;
    }
    const reordered = [...credentials];
    const [moved] = reordered.splice(index, 1);
    if (!moved) {
      return;
    }
    reordered.splice(target, 0, moved);
    setCredentials(reordered); // optimistic
    try {
      setCredentials(await api.reorderLlmCredentials(reordered.map((c) => c.id)));
    } catch {
      await load(); // out of sync with the server — reconcile from source of truth
    }
  }

  async function toggleEnabled(credential: LlmCredential): Promise<void> {
    try {
      const updated = await api.updateLlmCredential(credential.id, { enabled: !credential.enabled });
      setCredentials((current) => current.map((c) => (c.id === updated.id ? updated : c)));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update provider');
    }
  }

  async function remove(credentialId: number): Promise<void> {
    try {
      await api.deleteLlmCredential(credentialId);
      setCredentials((current) => current.filter((c) => c.id !== credentialId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not remove provider');
    }
  }

  async function test(credentialId: number): Promise<void> {
    setTesting(credentialId);
    try {
      const result = await api.testLlmCredential(credentialId);
      setTestResults((current) => ({ ...current, [credentialId]: result }));
    } catch (caught) {
      setTestResults((current) => ({
        ...current,
        [credentialId]: {
          ok: false,
          message: caught instanceof ApiError ? caught.message : 'Test failed',
        },
      }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <div>
            <h2 className="modal__title">AI Providers</h2>
            <p className="modal__subtitle">
              Add your own API keys. Tried in order — if one is rate-limited or down, the next
              one is used automatically.
            </p>
          </div>
          <button className="button button--ghost" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        {error && <p className="auth__error">{error}</p>}

        {loading ? (
          <p className="chat__empty">Loading…</p>
        ) : (
          <ul className="credential-list">
            {credentials.length === 0 && (
              <li className="sidebar__empty">
                No providers yet. Add one below — it becomes the first (and only) one tried.
              </li>
            )}
            {credentials.map((credential, index) => (
              <li key={credential.id} className="credential-row">
                <div className="credential-row__order">
                  <button
                    className="button button--ghost button--icon"
                    type="button"
                    disabled={index === 0}
                    onClick={() => void move(credential.id, -1)}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className="button button--ghost button--icon"
                    type="button"
                    disabled={index === credentials.length - 1}
                    onClick={() => void move(credential.id, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </div>

                <div className="credential-row__main">
                  <div className="credential-row__title">
                    <span className="credential-row__label">{credential.label}</span>
                    <span className="credential-row__provider">
                      {PROVIDER_INFO[credential.provider].label}
                    </span>
                    {!credential.enabled && <span className="group__badge">disabled</span>}
                  </div>
                  <div className="credential-row__meta">
                    {credential.model}
                    {credential.maskedApiKey ? ` · ${credential.maskedApiKey}` : ''}
                  </div>
                  {testResults[credential.id] && (
                    <div
                      className={
                        testResults[credential.id]?.ok ? 'credential-row__ok' : 'credential-row__fail'
                      }
                    >
                      {testResults[credential.id]?.message}
                    </div>
                  )}
                </div>

                <div className="credential-row__actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => void test(credential.id)}
                    disabled={testing === credential.id}
                  >
                    {testing === credential.id ? 'Testing…' : 'Test'}
                  </button>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => void toggleEnabled(credential)}
                  >
                    {credential.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => void remove(credential.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <AddCredentialForm
          onAdded={(credential) => setCredentials((current) => [...current, credential])}
        />
      </div>
    </div>
  );
}

function AddCredentialForm({ onAdded }: { onAdded: (credential: LlmCredential) => void }): JSX.Element {
  const [provider, setProvider] = useState<ProviderKind>('groq');
  const [label, setLabel] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const info = PROVIDER_INFO[provider];

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await api.createLlmCredential({
        provider,
        label,
        model,
        ...(info.needsKey ? { apiKey } : {}),
        ...(info.needsBaseUrl ? { baseUrl } : {}),
      });
      onAdded(created);
      setLabel('');
      setModel('');
      setApiKey('');
      setBaseUrl('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not add provider');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="credential-form" onSubmit={(event) => void handleSubmit(event)}>
      <h3 className="credential-form__title">Add a provider</h3>
      <div className="credential-form__grid">
        <label className="field">
          <span className="field__label">Provider</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value as ProviderKind)}>
            {PROVIDER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {PROVIDER_INFO[kind].label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Label</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="My Groq key"
            required
          />
        </label>
        <label className="field">
          <span className="field__label">Model</span>
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="llama-3.3-70b-versatile"
            required
          />
        </label>
        {info.needsKey && (
          <label className="field">
            <span className="field__label">API key {info.help && `(${info.help})`}</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              required
            />
          </label>
        )}
        {info.needsBaseUrl && (
          <label className="field">
            <span className="field__label">Base URL {info.help && `(${info.help})`}</span>
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://..."
              required
            />
          </label>
        )}
      </div>
      {error && <p className="auth__error">{error}</p>}
      <button className="button" type="submit" disabled={busy}>
        {busy ? 'Adding…' : 'Add provider'}
      </button>
    </form>
  );
}
