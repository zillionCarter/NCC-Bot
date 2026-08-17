import { useState } from 'react';
import type { ModelContent } from '../../types';
import { Markdown } from './Markdown';
import { asMath } from '../lib/normalizeMarkdown';
import { Artifact, GhostButton } from './Artifact';

type WorkedExampleContent = Extract<ModelContent, { type: 'worked_example' }>;

/**
 * The product's thesis made visible: the student's own problem sits untouched on
 * the left, a structurally identical one is solved in full on the right, and the
 * method is handed back at the bottom.
 *
 * Showing both side by side is deliberate. If the model ever cheats and reuses the
 * original numbers, the student sees it immediately rather than trusting a claim
 * that the example is different.
 *
 * Steps reveal one at a time, because the point is to attempt each line before
 * reading it — an all-at-once dump is just the answer with extra stages.
 */
export function WorkedExample({ content }: { content: WorkedExampleContent }) {
  const totalSteps = content.steps.length;
  const [revealed, setRevealed] = useState(totalSteps > 0 ? 1 : 0);

  const allRevealed = revealed >= totalSteps;
  const visibleSteps = content.steps.slice(0, revealed);

  return (
    <Artifact
      label="Worked example"
      title={content.title}
      actions={
        totalSteps > 1 && !allRevealed ? (
          <GhostButton onClick={() => setRevealed(totalSteps)}>Show all</GhostButton>
        ) : undefined
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-md border border-dashed border-rule-strong bg-sunken px-3 py-3">
          <p className="eyebrow">Your problem — not solved</p>
          <div className="mt-1.5 text-body text-graphite">
            <Markdown inline>{content.original_restated}</Markdown>
          </div>
        </section>

        <section className="gridded rounded-md border border-accent/30 bg-raised px-3 py-3">
          <p className="eyebrow text-accent">Practice version — same method</p>
          <div className="mt-1.5 text-body text-ink">
            <Markdown inline>{content.parallel_problem}</Markdown>
          </div>
        </section>
      </div>

      {content.what_changed && (
        <p className="mt-3 font-mono text-tiny text-pencil">
          <span className="text-graphite">Changed:</span> {content.what_changed}
        </p>
      )}

      <ol className="mt-5 space-y-4">
        {visibleSteps.map((step, index) => (
          <li key={index} className="animate-rise flex gap-3">
            <span
              aria-hidden
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-rule bg-sunken font-mono text-micro text-graphite"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              {step.latex && (
                <div className="overflow-x-auto">
                  <Markdown>{asMath(step.latex, true)}</Markdown>
                </div>
              )}
              <div className="text-base text-graphite">
                <Markdown inline>{step.explanation}</Markdown>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {!allRevealed && (
        <button
          type="button"
          onClick={() => setRevealed((n) => n + 1)}
          className="mt-4 rounded-md border border-rule-strong bg-raised px-3 py-1.5 text-small font-medium text-ink transition-colors hover:bg-sunken"
        >
          Next step
          <span className="ml-2 font-mono text-micro text-pencil">
            {revealed} / {totalSteps}
          </span>
        </button>
      )}

      {allRevealed && content.final_answer && (
        <div className="mt-5 border-t border-rule pt-4">
          <p className="eyebrow">Answer to the practice version</p>
          <div className="mt-1">
            <Markdown>{asMath(content.final_answer, true)}</Markdown>
          </div>
        </div>
      )}

      {allRevealed && content.your_turn && (
        <div className="mt-4">
          <p className="eyebrow">Your turn</p>
          {/* The one place the school yellow is spent — the line that hands the
              method back is the line that matters. The highlighter has to sit on the
              element that directly contains the text, or there is nothing to paint. */}
          <div className="mt-1.5">
            <Markdown inline className="marked text-body text-ink">
              {content.your_turn}
            </Markdown>
          </div>
        </div>
      )}
    </Artifact>
  );
}
