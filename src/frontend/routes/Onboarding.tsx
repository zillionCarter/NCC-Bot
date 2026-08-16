import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitOnboarding, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';

type Step = 'intro' | 'name' | 'gradeOrSubject' | 'submitting';

const INTRO_MESSAGE =
  "Hi, I'm NCC Bot! I'm here to help you learn — I'll usually guide you to answers rather than just giving them to you, and like any AI I can get things wrong, so always think critically about what I say. Let's get you set up.";

export function Onboarding() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('intro');
  const [name, setName] = useState('');
  const [gradeOrSubject, setGradeOrSubject] = useState('');
  const [error, setError] = useState('');

  async function handleFinalSubmit(finalGradeOrSubject: string) {
    setStep('submitting');
    setError('');
    try {
      await submitOnboarding(name.trim(), finalGradeOrSubject.trim());
      await refresh();
      navigate('/');
    } catch (err) {
      setStep('gradeOrSubject');
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-canvas p-6 text-ink">
      <div className="w-full max-w-md space-y-4">
        <div className="rounded rounded-bl-none bg-surface p-4">{INTRO_MESSAGE}</div>

        {step === 'intro' && (
          <button onClick={() => setStep('name')} className="rounded bg-primary px-3 py-2 text-primary-ink">
            Let's go
          </button>
        )}

        {(step === 'name' || step === 'gradeOrSubject' || step === 'submitting') && (
          <div className="rounded rounded-bl-none bg-surface p-4">What should I call you?</div>
        )}

        {step === 'name' && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (name.trim()) setStep('gradeOrSubject');
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="flex-1 rounded border border-line bg-canvas px-3 py-2 text-ink"
            />
            <button type="submit" className="rounded bg-primary px-3 py-2 text-primary-ink">
              Next
            </button>
          </form>
        )}

        {(step === 'gradeOrSubject' || step === 'submitting') && (
          <>
            <div className="rounded rounded-bl-none bg-surface p-4">
              And what grade are you in? (Teachers/admins: what subject do you teach?)
            </div>
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (gradeOrSubject.trim()) handleFinalSubmit(gradeOrSubject);
              }}
              className="flex gap-2"
            >
              <input
                autoFocus
                value={gradeOrSubject}
                onChange={(e) => setGradeOrSubject(e.target.value)}
                placeholder="e.g. Year 10, or Mathematics"
                disabled={step === 'submitting'}
                className="flex-1 rounded border border-line bg-canvas px-3 py-2 text-ink"
              />
              <button
                type="submit"
                disabled={step === 'submitting'}
                className="rounded bg-primary px-3 py-2 text-primary-ink disabled:opacity-50"
              >
                {step === 'submitting' ? 'Saving…' : 'Finish'}
              </button>
            </form>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
