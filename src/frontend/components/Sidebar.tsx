import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { listConversations } from '../api/client';
import type { Conversation } from '../../types';

export function Sidebar({ refreshKey }: { refreshKey: number }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const { conversationId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    listConversations()
      .then(({ conversations }) => setConversations(conversations))
      .catch(() => setConversations([]));
  }, [refreshKey]);

  return (
    <aside className="flex w-64 flex-col border-r border-line bg-surface">
      <button
        onClick={() => navigate('/')}
        className="m-2 rounded border border-line px-3 py-2 text-left text-sm hover:bg-canvas"
      >
        + New chat
      </button>
      <nav className="flex-1 overflow-y-auto">
        {conversations.map((c) => (
          <Link
            key={c.id}
            to={`/c/${c.id}`}
            className={`block truncate px-3 py-2 text-sm hover:bg-canvas ${
              c.id === conversationId ? 'bg-canvas font-medium' : ''
            }`}
          >
            {c.title || 'Untitled chat'}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
