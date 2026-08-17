import { Markdown } from './Markdown';

interface Suggestion {
  label: string;
  hint: string;
  prompt: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    label: 'Explain something',
    hint: 'A straight answer to a straight question',
    prompt: 'Explain how photosynthesis works, and why plants need light for it.',
  },
  {
    label: 'Get unstuck on a problem',
    hint: 'The method, worked on a twin of your question',
    prompt: "I'm stuck on solving 3x + 7 = 22. Show me the method on a similar problem.",
  },
  {
    label: 'See it plotted',
    hint: 'Drag the coefficients and watch the curve move',
    prompt: 'Plot y = ax^2 + bx + c so I can see what each coefficient changes.',
  },
  {
    label: 'Plan my revision',
    hint: 'Dated sessions you can tick off',
    prompt: 'Build me a revision plan for a Year 10 maths exam in two weeks.',
  },
  {
    label: 'Find sources to cite',
    hint: 'Real pages, checked — not invented links',
    prompt: 'Find credible sources on the causes of World War I for a Year 11 history essay.',
  },
  {
    label: 'Condense my notes',
    hint: 'Key points and the terms that matter',
    prompt: 'Summarise these notes into key points and key terms:\n\n',
  },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The empty state opens with the one thing that makes this app different: it will
 * not hand over the answer to a problem you were set, it will solve its twin so you
 * can do yours. Demonstrating that beats describing it, and it sets the expectation
 * before the first refusal reads as a malfunction.
 */
export function Welcome({ name, onPick }: { name: string | null; onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-5 sm:py-14 lg:max-w-4xl">
      <header className="animate-rise">
        <p className="eyebrow">NCC Bot</p>
        <h1 className="mt-2 font-display text-display font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-hero">
          {greeting()}
          {name ? <>, {name}</> : ''}.
        </h1>
        <p className="mt-3 max-w-xl text-lead leading-relaxed text-graphite">
          Ask me anything you want to understand. I&apos;ll explain it properly — and when it&apos;s work you&apos;ve
          been set, I&apos;ll show you how rather than doing it for you.
        </p>
      </header>

      {/* The signature moment: the parallel-problem move, stated concretely. */}
      <div
        className="animate-rise gridded mt-9 rounded-[var(--radius-card)] border border-rule bg-raised px-5 py-4"
        style={{ animationDelay: '60ms' }}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div>
            <p className="eyebrow">You ask</p>
            <div className="mt-1 font-display text-body text-graphite">
              <Markdown inline>{'“What’s the answer to $3x + 7 = 22$?”'}</Markdown>
            </div>
          </div>
          <div aria-hidden className="hidden text-pencil sm:block">
            →
          </div>
          <div>
            <p className="eyebrow text-accent">I solve</p>
            <div className="mt-1 font-display text-body text-ink">
              <Markdown inline>{'$5x + 4 = 29$, line by line'}</Markdown>
            </div>
          </div>
        </div>
        <p className="mt-3 border-t border-rule pt-3 text-small text-graphite">
          Same method, different numbers. You get the technique, and the answer on your page stays yours.
        </p>
      </div>

      <div className="mt-9 grid gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion, index) => (
          <button
            key={suggestion.label}
            type="button"
            onClick={() => onPick(suggestion.prompt)}
            className="animate-rise group rounded-[var(--radius-card)] border border-rule bg-raised px-4 py-3 text-left transition-colors hover:border-rule-strong hover:bg-sunken"
            style={{ animationDelay: `${100 + index * 35}ms` }}
          >
            <span className="block font-medium text-ink group-hover:text-accent">{suggestion.label}</span>
            <span className="mt-0.5 block text-small text-graphite">{suggestion.hint}</span>
          </button>
        ))}
      </div>

      <p className="animate-rise mt-8 border-t border-rule pt-5 text-small text-pencil" style={{ animationDelay: '340ms' }}>
        I won&apos;t write your essay or fill in an assignment for you — ask and I&apos;ll help you build it instead. I
        can also be wrong, so check anything that counts.
      </p>
    </div>
  );
}
