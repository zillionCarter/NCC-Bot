import { useEffect, useState, type FormEvent } from 'react';
import { requestMagicLink, verifySignInCode, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';

type Stage = 'email' | 'sent' | 'code';

const RESEND_COOLDOWN_SECONDS = 30;

export function Login() {
  const { refresh } = useAuth();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function requestLink(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError('');
    try {
      await requestMagicLink(email.trim().toLowerCase());
      setStage('sent');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await verifySignInCode(email.trim().toLowerCase(), code);
      // Gate redirects into the app as soon as the session is visible.
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="flex items-center gap-2.5 px-4 py-4 sm:px-5">
        <img src={logo} alt="" className="h-7 w-auto" />
        <span className="font-display text-body font-semibold text-ink">NCC Bot</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-5">
        <div className="w-full max-w-sm">
          {stage === 'email' && (
            <form onSubmit={requestLink} className="animate-rise">
              <p className="eyebrow">Sign in</p>
              <h1 className="mt-2 font-display text-display font-semibold leading-tight tracking-[-0.02em]">
                Your school email is all you need.
              </h1>
              <p className="mt-3 text-base text-graphite">
                No password to remember. We&apos;ll send a link that signs you in, and it works the same way on any
                device.
              </p>

              <label htmlFor="email" className="eyebrow mt-7 block">
                School email
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@yourschool.edu.au"
                className="mt-1.5 w-full rounded-md border border-rule bg-raised px-3 py-2.5 text-body text-ink placeholder:text-pencil"
              />

              {error && <p className="mt-2.5 text-small text-wrong">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="mt-4 w-full rounded-md bg-accent px-3 py-2.5 text-body font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>
          )}

          {stage === 'sent' && (
            <div className="animate-rise">
              <p className="eyebrow">Check your email</p>
              <h1 className="mt-2 font-display text-title font-semibold leading-snug">
                We sent a link to {email}.
              </h1>
              <p className="mt-3 text-base text-graphite">
                Open it on this device and you&apos;re in. The link expires in 15 minutes and works once.
              </p>

              <div className="mt-7 space-y-2.5 border-t border-rule pt-5">
                <button
                  type="button"
                  onClick={() => setStage('code')}
                  className="w-full rounded-md border border-rule-strong bg-raised px-3 py-2.5 text-base font-medium text-ink transition-colors hover:bg-sunken"
                >
                  Enter the code instead
                </button>
                <button
                  type="button"
                  onClick={() => requestLink()}
                  disabled={busy || cooldown > 0}
                  className="w-full rounded-md px-3 py-2 text-small text-graphite transition-colors hover:text-ink disabled:opacity-50"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send it again'}
                </button>
              </div>

              {error && <p className="mt-2.5 text-small text-wrong">{error}</p>}
            </div>
          )}

          {stage === 'code' && (
            <form onSubmit={submitCode} className="animate-rise">
              <p className="eyebrow">Sign in with a code</p>
              <h1 className="mt-2 font-display text-title font-semibold leading-snug">
                Type the 6 digits from the email.
              </h1>
              <p className="mt-3 text-base text-graphite">
                Useful when your mail is on a different device to the one you want to use.
              </p>

              <label htmlFor="code" className="eyebrow mt-7 block">
                Sign-in code
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="000000"
                maxLength={7}
                className="mt-1.5 w-full rounded-md border border-rule bg-raised px-3 py-2.5 text-center font-mono text-display tracking-[0.3em] text-ink placeholder:text-pencil"
              />

              {error && <p className="mt-2.5 text-small text-wrong">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="mt-4 w-full rounded-md bg-accent px-3 py-2.5 text-body font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Checking…' : 'Sign in'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStage('sent');
                  setError('');
                }}
                className="mt-2 w-full px-3 py-2 text-small text-graphite transition-colors hover:text-ink"
              >
                Back
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
