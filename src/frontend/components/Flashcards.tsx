import { useState } from 'react';

interface Card {
  front: string;
  back: string;
}

export function Flashcards({ cards }: { cards: Card[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (cards.length === 0) return null;
  const card = cards[index];

  function go(delta: number) {
    setFlipped(false);
    setIndex((i) => Math.max(0, Math.min(cards.length - 1, i + delta)));
  }

  return (
    <div className="w-72">
      <button
        onClick={() => setFlipped((f) => !f)}
        className="flex h-40 w-full items-center justify-center rounded border border-line bg-canvas p-4 text-center"
      >
        {flipped ? card.back : card.front}
      </button>
      <div className="mt-2 flex items-center justify-between text-sm text-ink-muted">
        <button onClick={() => go(-1)} disabled={index === 0} className="disabled:opacity-30">
          ← Prev
        </button>
        <span>
          {index + 1} / {cards.length}
        </span>
        <button onClick={() => go(1)} disabled={index === cards.length - 1} className="disabled:opacity-30">
          Next →
        </button>
      </div>
    </div>
  );
}
