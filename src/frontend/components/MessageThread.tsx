import type { ClientMessage } from '../api/client';
import { Flashcards } from './Flashcards';
import { PracticeTest } from './PracticeTest';

export function MessageThread({
  messages,
  conversationId,
}: {
  messages: ClientMessage[];
  conversationId: string | null;
}) {
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
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
          </div>
        </div>
      ))}
    </div>
  );
}
