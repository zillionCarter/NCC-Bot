import { useEffect, useRef } from 'react';
import type { ClientMessage } from '../api/client';
import { Flashcards } from './Flashcards';
import { PracticeTest } from './PracticeTest';
import { Graph } from './Graph';

const NEAR_BOTTOM_THRESHOLD_PX = 80;

export function MessageThread({
  messages,
  conversationId,
}: {
  messages: ClientMessage[];
  conversationId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
  }

  // Reset before the messages effect below runs, so switching conversations
  // always scrolls to the bottom regardless of scroll position in the
  // previous conversation.
  useEffect(() => {
    isNearBottomRef.current = true;
  }, [conversationId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isNearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 space-y-4 overflow-y-auto p-4">
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-2xl rounded p-3 ${
              m.role === 'user' ? 'bg-primary text-primary-ink' : 'bg-surface text-ink'
            }`}
          >
            {m.content.type === 'text' && <p className="whitespace-pre-wrap">{m.content.text}</p>}
            {m.content.type === 'flashcards' && <Flashcards cards={m.content.cards} />}
            {m.content.type === 'practice_test' && conversationId && (
              <PracticeTest conversationId={conversationId} messageId={m.id} questions={m.content.questions} />
            )}
            {m.content.type === 'graph' && <Graph content={m.content} />}
          </div>
        </div>
      ))}
    </div>
  );
}
