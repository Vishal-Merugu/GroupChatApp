import { useState, type FormEvent } from 'react';

import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Mode = 'login' | 'signup';

export function AuthForm(): JSX.Element {
  const { login, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await signUp({ name, email, phone, password });
      }
    } catch (caught) {
      // Field-level detail from the server's validation errors is surfaced
      // inline; anything else becomes a single form-level message.
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.details);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={(event) => void handleSubmit(event)}>
        <h1 className="auth__title">GroupChat</h1>
        <p className="auth__subtitle">
          {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
        </p>

        {mode === 'signup' && (
          <Field label="Name" error={fieldErrors.name}>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
        )}

        <Field label="Email" error={fieldErrors.email}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </Field>

        {mode === 'signup' && (
          <Field label="Phone" error={fieldErrors.phone}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+49 123 456789"
              required
            />
          </Field>
        )}

        <Field label="Password" error={fieldErrors.password}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </Field>

        {error && <p className="auth__error">{error}</p>}

        <button className="button" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Sign up'}
        </button>

        <button
          className="auth__switch"
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError(null);
            setFieldErrors({});
          }}
        >
          {mode === 'login' ? 'Need an account? Sign up' : 'Already registered? Sign in'}
        </button>
      </form>
    </div>
  );
}

function Field(props: {
  label: string;
  error?: string[];
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="field">
      <span className="field__label">{props.label}</span>
      {props.children}
      {props.error && <span className="field__error">{props.error.join(', ')}</span>}
    </label>
  );
}
