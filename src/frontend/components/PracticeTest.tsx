import { useState } from 'react';
import { gradePracticeTest, type GradeResult } from '../api/client';

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

  const allAnswered = answers.every((a) => a.trim() !== '');

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const { results } = await gradePracticeTest(conversationId, messageId, answers);
      setResults(results);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-xl space-y-4">
      {questions.map((q, i) => (
        <div key={i} className="rounded border border-line bg-canvas p-3">
          <p className="font-medium">{q.prompt}</p>
          {q.choices ? (
            <div className="mt-2 space-y-1">
              {q.choices.map((choice) => (
                <label key={choice} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`q-${messageId}-${i}`}
                    aria-label={choice}
                    value={choice}
                    checked={answers[i] === choice}
                    disabled={results !== null}
                    onChange={() => setAnswers((prev) => prev.map((a, idx) => (idx === i ? choice : a)))}
                  />
                  {choice}
                </label>
              ))}
            </div>
          ) : (
            <input
              value={answers[i]}
              disabled={results !== null}
              onChange={(e) => setAnswers((prev) => prev.map((a, idx) => (idx === i ? e.target.value : a)))}
              className="mt-2 w-full rounded border border-line bg-surface px-2 py-1 text-sm"
            />
          )}
          {results && (
            <p className={`mt-2 text-sm ${results[i].correct ? 'text-green-700' : 'text-red-700'}`}>
              {results[i].correct ? 'Correct! ' : `Not quite — the answer is "${results[i].correct_answer}". `}
              {results[i].explanation}
            </p>
          )}
        </div>
      ))}
      {!results && (
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
          className="rounded bg-primary px-4 py-2 text-primary-ink disabled:opacity-50"
        >
          {submitting ? 'Checking…' : 'Submit'}
        </button>
      )}
    </div>
  );
}
