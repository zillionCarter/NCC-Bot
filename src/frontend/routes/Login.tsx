import { useState, type FormEvent } from 'react';
import { requestMagicLink, ApiError } from '../api/client';

export function Login() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      await requestMagicLink(email.trim());
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  if (status === 'sent') {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas text-ink">
        <div className="max-w-sm text-center">
          <h1 className="font-heading text-xl font-semibold">Check your email</h1>
          <p className="mt-2 text-ink-muted">
            We sent a sign-in link to {email}. Click it to continue — this tab can stay open.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-canvas text-ink">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3 rounded border border-line bg-surface p-6">
        <h1 className="font-heading text-xl font-semibold">Sign in to NCC Bot</h1>
        <p className="text-sm text-ink-muted">Use your school email address (must end in .edu.au).</p>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourschool.edu.au"
          className="w-full rounded border border-line bg-canvas px-3 py-2 text-ink"
        />
        {status === 'error' && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={status === 'sending'}
          className="w-full rounded bg-primary px-3 py-2 text-primary-ink disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
        </button>
      </form>
    </div>
  );
}
