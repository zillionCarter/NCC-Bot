import { useEffect, useRef, useState } from 'react';
import { Markdown } from './Markdown';
import { Artifact, GhostButton } from './Artifact';

interface Card {
  front: string;
  back: string;
}

export function Flashcards({ cards }: { cards: Card[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  const cardRef = useRef<HTMLButtonElement>(null);

  if (cards.length === 0) {
    return (
      <Artifact label="Flashcards">
        <p className="text-small text-pencil">This set arrived empty.</p>
      </Artifact>
    );
  }

  const card = cards[Math.min(index, cards.length - 1)];

  function go(delta: number) {
    const next = Math.max(0, Math.min(cards.length - 1, index + delta));
    setFlipped(false);
    setIndex(next);
    setSeen((prev) => new Set(prev).add(next));
  }

  // Arrow keys and space are what people reach for on a card stack, but only once
  // the stack itself has focus — hijacking them globally would break the composer.
  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      setFlipped((f) => !f);
    }
  }

  useEffect(() => {
    setSeen((prev) => new Set(prev).add(index));
  }, [index]);

  return (
    <Artifact
      label="Flashcards"
      actions={
        <span className="font-mono text-micro text-pencil">
          {seen.size} / {cards.length} seen
        </span>
      }
    >
      <div onKeyDown={handleKeyDown}>
        <button
          ref={cardRef}
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-live="polite"
          className={`flex min-h-[9.5rem] w-full flex-col items-center justify-center rounded-[var(--radius-card)] border px-5 py-6 text-center transition-colors ${
            flipped ? 'border-accent/40 bg-accent-soft' : 'gridded border-rule-strong bg-raised'
          }`}
        >
          <span className="eyebrow mb-2">{flipped ? 'Answer' : 'Question'}</span>
          <span className="font-display text-lead leading-snug text-ink">
            <Markdown inline>{flipped ? card.back : card.front}</Markdown>
          </span>
          {!flipped && <span className="mt-3 font-mono text-micro text-pencil">click to flip</span>}
        </button>

        <div className="mt-3 flex items-center justify-between">
          <GhostButton onClick={() => go(-1)} disabled={index === 0}>
            ← Prev
          </GhostButton>
          <div className="flex items-center gap-1.5" aria-hidden>
            {cards.map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === index ? 'w-4 bg-accent' : seen.has(i) ? 'w-1 bg-rule-strong' : 'w-1 bg-rule'
                }`}
              />
            ))}
          </div>
          <GhostButton onClick={() => go(1)} disabled={index === cards.length - 1}>
            Next →
          </GhostButton>
        </div>
      </div>
    </Artifact>
  );
}
