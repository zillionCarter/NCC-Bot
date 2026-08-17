import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getConversation, sendMessageStream, type ClientMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useRefreshSidebar } from '../components/Layout';
import { MessageThread } from '../components/MessageThread';
import { MessageInput } from '../components/MessageInput';
import { Welcome } from '../components/Welcome';

export function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const refreshSidebar = useRefreshSidebar();

  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [pendingTool, setPendingTool] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<(() => void) | null>(null);
  const lastSentRef = useRef<string>('');

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    getConversation(conversationId)
      .then(({ messages: loaded }) => {
        if (!cancelled) setMessages(loaded);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Abort an in-flight stream if the component goes away mid-answer.
  useEffect(() => () => abortRef.current?.(), []);

  function resetStreamState() {
    setStreamingText('');
    setPendingTool(null);
    setBusy(false);
    abortRef.current = null;
  }

  function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    lastSentRef.current = message;
    setError(null);
    setDraft('');
    setBusy(true);
    setStreamingText('');
    setPendingTool(null);

    const optimisticId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        role: 'user',
        content: { type: 'text', text: message },
        created_at: new Date().toISOString(),
      },
    ]);

    abortRef.current = sendMessageStream(message, conversationId, {
      onDelta: (delta) => setStreamingText((prev) => prev + delta),
      onTool: (name) => {
        // Any streamed preamble belongs to the card that is replacing it.
        setStreamingText('');
        setPendingTool(name);
      },
      onDone: ({ conversationId: id, messageId, message: content }) => {
        setMessages((prev) => [
          ...prev,
          { id: messageId, role: 'model', content, created_at: new Date().toISOString() },
        ]);
        resetStreamState();
        refreshSidebar();
        if (!conversationId) navigate(`/c/${id}`, { replace: true });
      },
      onError: (messageText) => {
        // Drop the optimistic turn: the reply failed, so leaving a lone question
        // in the thread would misrepresent what happened.
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setError(messageText);
        resetStreamState();
      },
    });
  }

  function stop() {
    abortRef.current?.();
    // The server finishes and stores the turn regardless; refetching is what keeps
    // the thread honest about what was actually saved.
    resetStreamState();
    if (conversationId) {
      getConversation(conversationId)
        .then(({ messages: loaded }) => setMessages(loaded))
        .catch(() => undefined);
    }
  }

  const isEmpty = messages.length === 0 && !busy && !error;

  return (
    <>
      {isEmpty ? (
        <div className="subtle-scroll flex-1 overflow-y-auto">
          <Welcome
            name={user?.name ?? null}
            onPick={(prompt) => {
              // Seed the composer rather than sending outright — most of these are
              // starting points a student will want to edit first.
              setDraft(prompt);
              document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.focus();
            }}
          />
        </div>
      ) : (
        <MessageThread
          messages={messages}
          conversationId={conversationId ?? null}
          streamingText={streamingText}
          pendingTool={pendingTool}
          isWaiting={busy}
          error={error}
          onRetry={() => send(lastSentRef.current)}
        />
      )}

      <MessageInput
        value={draft}
        onChange={setDraft}
        onSend={() => send(draft)}
        onStop={stop}
        busy={busy}
      />
    </>
  );
}
