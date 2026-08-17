import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { listConversations, renameConversation, deleteConversation } from '../api/client';
import type { Conversation } from '../../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Groups by recency, because that is how people look for a conversation again. */
function bucketOf(created: string): string {
  const time = new Date(created).getTime();
  if (Number.isNaN(time)) return 'Earlier';

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayStart = startOfToday.getTime();

  if (time >= todayStart) return 'Today';
  if (time >= todayStart - DAY_MS) return 'Yesterday';
  if (time >= todayStart - 7 * DAY_MS) return 'Previous 7 days';
  if (time >= todayStart - 30 * DAY_MS) return 'Previous 30 days';
  return 'Earlier';
}

const BUCKET_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Earlier'];

export function Sidebar({ refreshKey, onNavigate }: { refreshKey: number; onNavigate?: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const editInputRef = useRef<HTMLInputElement>(null);
  const { conversationId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    listConversations()
      .then(({ conversations: list }) => {
        if (!cancelled) setConversations(list);
      })
      .catch(() => {
        if (!cancelled) setConversations([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (editingId) editInputRef.current?.select();
  }, [editingId]);

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? conversations.filter((c) => (c.title ?? '').toLowerCase().includes(needle))
      : conversations;

    const buckets = new Map<string, Conversation[]>();
    for (const conversation of filtered) {
      const bucket = bucketOf(conversation.created_at);
      const existing = buckets.get(bucket);
      if (existing) existing.push(conversation);
      else buckets.set(bucket, [conversation]);
    }
    return BUCKET_ORDER.filter((bucket) => buckets.has(bucket)).map((bucket) => ({
      bucket,
      items: buckets.get(bucket)!,
    }));
  }, [conversations, query]);

  async function commitRename(id: string) {
    const title = draftTitle.trim();
    setEditingId(null);
    const previous = conversations.find((c) => c.id === id)?.title ?? null;
    if (!title || title === previous) return;

    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    try {
      await renameConversation(id, title);
    } catch {
      // Put the old name back rather than leaving the list claiming a rename
      // that the server rejected.
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: previous } : c)));
    }
  }

  async function remove(id: string, title: string | null) {
    const label = title?.trim() || 'this chat';
    if (!window.confirm(`Delete “${label}”? This removes the whole conversation and can't be undone.`)) return;

    const snapshot = conversations;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    try {
      await deleteConversation(id);
      if (conversationId === id) navigate('/', { replace: true });
    } catch {
      setConversations(snapshot);
    }
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-rule bg-sunken md:w-64 lg:w-72">
      <div className="p-2.5">
        <button
          onClick={() => {
            navigate('/');
            onNavigate?.();
          }}
          className="w-full rounded-md border border-rule-strong bg-raised px-3 py-2 text-left text-base font-medium text-ink transition-colors hover:bg-paper"
        >
          <span className="mr-1.5 text-pencil">＋</span> New chat
        </button>
      </div>

      {conversations.length > 6 && (
        <div className="px-2.5 pb-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="w-full rounded-md border border-rule bg-paper px-2.5 py-1.5 text-small text-ink placeholder:text-pencil"
          />
        </div>
      )}

      <nav className="subtle-scroll flex-1 overflow-y-auto px-1.5 pb-3">
        {loading ? (
          <p className="px-2 py-2 font-mono text-micro uppercase tracking-[0.08em] text-pencil">loading…</p>
        ) : grouped.length === 0 ? (
          <p className="px-2 py-3 text-small text-pencil">
            {query ? 'No chats match that.' : 'Your chats will appear here.'}
          </p>
        ) : (
          grouped.map(({ bucket, items }) => (
            <section key={bucket} className="mb-1">
              <h2 className="eyebrow px-2 py-1.5">{bucket}</h2>
              <ul>
                {items.map((conversation) => {
                  const active = conversation.id === conversationId;
                  const isEditing = editingId === conversation.id;

                  return (
                    <li key={conversation.id} className="group relative">
                      {isEditing ? (
                        <input
                          ref={editInputRef}
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          onBlur={() => commitRename(conversation.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') commitRename(conversation.id);
                            if (event.key === 'Escape') setEditingId(null);
                          }}
                          aria-label="Chat name"
                          className="w-full rounded-md border border-accent bg-raised px-2 py-1.5 text-small text-ink"
                        />
                      ) : (
                        <>
                          <Link
                            to={`/c/${conversation.id}`}
                            onClick={onNavigate}
                            className={`block truncate rounded-md py-1.5 pl-2 pr-14 text-small transition-colors ${
                              active ? 'bg-raised font-medium text-ink' : 'text-graphite hover:bg-raised hover:text-ink'
                            }`}
                          >
                            {conversation.title?.trim() || 'Untitled chat'}
                          </Link>

                          {/* hover-reveal stays visible on touch devices, where a
                              hover-only control can never be reached. */}
                          <div className="hover-reveal absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                            <button
                              type="button"
                              aria-label={`Rename ${conversation.title ?? 'chat'}`}
                              title="Rename"
                              onClick={() => {
                                setDraftTitle(conversation.title ?? '');
                                setEditingId(conversation.id);
                              }}
                              className="rounded p-1.5 text-tiny text-pencil hover:bg-sunken hover:text-ink"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${conversation.title ?? 'chat'}`}
                              title="Delete"
                              onClick={() => remove(conversation.id, conversation.title)}
                              className="rounded p-1 text-tiny text-pencil hover:bg-sunken hover:text-wrong"
                            >
                              ✕
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </nav>
    </aside>
  );
}
