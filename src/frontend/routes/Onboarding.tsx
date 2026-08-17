import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitOnboarding, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';

const YEAR_SUGGESTIONS = ['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12'];

/**
 * Two questions, both answerable in a few seconds, and the second is skippable.
 * Onboarding that interrogates you before you have seen anything work is the fastest
 * way to lose someone on their first visit.
 */
export function Onboarding() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [yearLevel, setYearLevel] = useState('');
  const [step, setStep] = useState<'name' | 'year'>('name');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function finish(finalYear: string) {
    setBusy(true);
    setError('');
    try {
      await submitOnboarding(name.trim(), finalYear.trim());
      await refresh();
      navigate('/');
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="flex items-center gap-2.5 px-5 py-4">
        <img src={logo} alt="" className="h-7 w-auto" />
        <span className="font-display text-body font-semibold text-ink">NCC Bot</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-md">
          {step === 'name' && (
            <form
              key="name"
              className="animate-rise"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                if (name.trim()) setStep('year');
              }}
            >
              <p className="eyebrow">Setting up</p>
              <h1 className="mt-2 font-display text-display font-semibold leading-tight tracking-[-0.02em]">
                What should I call you?
              </h1>
              <p className="mt-3 text-base text-graphite">
                Just a first name is fine. I&apos;ll use it when we talk.
              </p>

              <input
                autoFocus
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                aria-label="Your name"
                className="mt-6 w-full rounded-md border border-rule bg-raised px-3 py-2.5 text-body text-ink placeholder:text-pencil"
              />

              <button
                type="submit"
                disabled={!name.trim()}
                className="mt-4 w-full rounded-md bg-accent px-3 py-2.5 text-body font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Continue
              </button>
            </form>
          )}

          {step === 'year' && (
            <form
              key="year"
              className="animate-rise"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                finish(yearLevel);
              }}
            >
              <p className="eyebrow">One more thing</p>
              <h1 className="mt-2 font-display text-display font-semibold leading-tight tracking-[-0.02em]">
                What year are you in, {name.trim()}?
              </h1>
              <p className="mt-3 text-base text-graphite">
                This only sets how I pitch explanations — nothing else changes, and you can skip it.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {YEAR_SUGGESTIONS.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setYearLevel(year)}
                    className={`rounded-full border px-3 py-1.5 text-small transition-colors ${
                      yearLevel === year
                        ? 'border-accent bg-accent-soft font-medium text-ink'
                        : 'border-rule text-graphite hover:border-rule-strong hover:text-ink'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>

              <input
                value={yearLevel}
                maxLength={80}
                onChange={(event) => setYearLevel(event.target.value)}
                placeholder="Or type it — e.g. Year 10, or Mathematics"
                aria-label="Year level or subject"
                className="mt-3 w-full rounded-md border border-rule bg-raised px-3 py-2.5 text-body text-ink placeholder:text-pencil"
              />

              {error && <p className="mt-2.5 text-small text-wrong">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="mt-4 w-full rounded-md bg-accent px-3 py-2.5 text-body font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Start using NCC Bot'}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => finish('')}
                className="mt-2 w-full px-3 py-2 text-small text-graphite transition-colors hover:text-ink disabled:opacity-50"
              >
                Skip this
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
