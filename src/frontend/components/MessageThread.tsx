import type { ClientMessage } from '../api/client';

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
          </div>
        </div>
      ))}
    </div>
  );
}
