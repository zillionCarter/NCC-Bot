import { useState } from 'react';
import { gradePracticeTest, type GradeResult } from '../api/client';
import { Markdown } from './Markdown';
import { Artifact } from './Artifact';

interface Question {
  prompt: string;
  choices?: string[];
  correct_answer: string;
  explanation: string;
}

export function PracticeTest({
  conversationId,
  messageId,
  questions,
}: {
  conversationId: string;
  messageId: string;
  questions: Question[];
}) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));
  const [results, setResults] = useState<GradeResult[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const answered = answers.filter((a) => a.trim() !== '').length;
  const allAnswered = answered === questions.length;
  const score = results ? results.filter((r) => r.correct).length : 0;

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      // Answers are marked server-side: the correct ones are never sent to the
      // browser until after submission, so they cannot be read out of the page.
      const { results: graded } = await gradePracticeTest(conversationId, messageId, answers);
      setResults(graded);
    } catch {
      setError('That didn’t submit. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Artifact
      label="Practice test"
      actions={
        <span className="font-mono text-micro text-pencil">
          {results ? `${score} / ${questions.length} correct` : `${answered} / ${questions.length} answered`}
        </span>
      }
    >
      <ol className="space-y-5">
        {questions.map((question, index) => {
          const result = results?.[index];
          return (
            <li key={index}>
              <div className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-rule bg-sunken font-mono text-micro text-graphite"
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink">
                    <Markdown inline>{question.prompt}</Markdown>
                  </div>

                  {question.choices ? (
                    <div className="mt-2.5 space-y-1.5">
                      {question.choices.map((choice) => {
                        const selected = answers[index] === choice;
                        const isCorrectChoice = result && choice === result.correct_answer;
                        const isWrongPick = result && selected && !result.correct;
                        return (
                          <label
                            key={choice}
                            className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-2.5 py-1.5 text-base transition-colors ${
                              isCorrectChoice
                                ? 'border-correct/40 bg-correct-soft'
                                : isWrongPick
                                  ? 'border-wrong/40 bg-wrong-soft'
                                  : selected
                                    ? 'border-accent/40 bg-accent-soft'
                                    : 'border-rule hover:bg-sunken'
                            } ${results ? 'cursor-default' : ''}`}
                          >
                            <input
                              type="radio"
                              name={`q-${messageId}-${index}`}
                              aria-label={choice}
                              value={choice}
                              checked={selected}
                              disabled={results !== null}
                              onChange={() =>
                                setAnswers((prev) => prev.map((a, i) => (i === index ? choice : a)))
                              }
                              className="mt-[0.35em] size-3.5 shrink-0 accent-accent"
                            />
                            <span className="min-w-0 flex-1">
                              <Markdown inline>{choice}</Markdown>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      value={answers[index]}
                      disabled={results !== null}
                      placeholder="Your answer"
                      onChange={(e) => setAnswers((prev) => prev.map((a, i) => (i === index ? e.target.value : a)))}
                      className="mt-2.5 w-full rounded-md border border-rule bg-paper px-2.5 py-1.5 text-base text-ink placeholder:text-pencil disabled:opacity-70"
                    />
                  )}

                  {result && (
                    <div
                      className={`mt-2.5 rounded-md border px-3 py-2 text-small ${
                        result.correct ? 'border-correct/30 bg-correct-soft' : 'border-wrong/30 bg-wrong-soft'
                      }`}
                    >
                      <p className={`eyebrow ${result.correct ? 'text-correct' : 'text-wrong'}`}>
                        {result.correct ? 'Correct' : 'Not quite'}
                      </p>
                      {!result.correct && (
                        <p className="mt-1 text-ink">
                          The answer is <strong>{result.correct_answer}</strong>.
                        </p>
                      )}
                      <div className="mt-1 text-graphite">
                        <Markdown inline>{result.explanation}</Markdown>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {error && <p className="mt-4 text-small text-wrong">{error}</p>}

      {!results && (
        <div className="mt-5 flex items-center gap-3 border-t border-rule pt-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
            className="rounded-md bg-accent px-4 py-2 text-base font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Marking…' : 'Submit answers'}
          </button>
          {!allAnswered && (
            <span className="text-small text-pencil">
              {questions.length - answered} left to answer
            </span>
          )}
        </div>
      )}
    </Artifact>
  );
}
