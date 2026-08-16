import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getConversation, sendMessage, type ClientMessage } from '../api/client';
import { Sidebar } from '../components/Sidebar';
import { MessageThread } from '../components/MessageThread';
import { MessageInput } from '../components/MessageInput';

export function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    getConversation(conversationId)
      .then(({ messages }) => setMessages(messages))
      .catch(() => setMessages([]));
  }, [conversationId]);

  async function handleSend(message: string) {
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
    setSending(true);
    try {
      const result = await sendMessage(message, conversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: result.messageId,
          role: 'model',
          content: result.message,
          created_at: new Date().toISOString(),
        },
      ]);
      setSidebarRefreshKey((k) => k + 1);
      if (!conversationId) navigate(`/c/${result.conversationId}`, { replace: true });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Sidebar refreshKey={sidebarRefreshKey} />
      <div className="flex flex-1 flex-col">
        <MessageThread messages={messages} conversationId={conversationId ?? null} />
        <MessageInput onSend={handleSend} disabled={sending} />
      </div>
    </>
  );
}
