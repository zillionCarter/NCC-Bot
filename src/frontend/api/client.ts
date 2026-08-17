import type { Conversation, ModelContent, Role } from '../../types';

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  grade_or_subject: string | null;
  onboarded: number;
}

export interface ClientMessage {
  id: string;
  role: 'user' | 'model';
  content: ModelContent;
  created_at: string;
}

export interface GradeResult {
  correct: boolean;
  correct_answer: string;
  explanation: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  created_at: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `request to ${path} failed with ${res.status}`);
  }
  return (await res.json()) as T;
}

export function requestMagicLink(email: string): Promise<{ ok: true }> {
  return request('/auth/request', { method: 'POST', body: JSON.stringify({ email }) });
}

export function verifySignInCode(email: string, code: string): Promise<{ ok: true }> {
  return request('/auth/verify-code', { method: 'POST', body: JSON.stringify({ email, code }) });
}

export function logout(): Promise<{ ok: true }> {
  return request('/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<{ user: ApiUser }> {
  return request('/api/me');
}

export function submitOnboarding(name: string, gradeOrSubject: string): Promise<{ ok: true }> {
  return request('/api/onboarding', { method: 'POST', body: JSON.stringify({ name, gradeOrSubject }) });
}

export function listConversations(): Promise<{ conversations: Conversation[] }> {
  return request('/api/conversations');
}

export function getConversation(id: string): Promise<{ messages: ClientMessage[] }> {
  return request(`/api/conversations/${id}`);
}

export function renameConversation(id: string, title: string): Promise<{ ok: true }> {
  return request(`/api/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
}

export function deleteConversation(id: string): Promise<{ ok: true }> {
  return request(`/api/conversations/${id}`, { method: 'DELETE' });
}

export function sendMessage(
  message: string,
  conversationId?: string
): Promise<{ conversationId: string; messageId: string; message: ModelContent }> {
  return request('/api/chat', { method: 'POST', body: JSON.stringify({ message, conversationId }) });
}

export function gradePracticeTest(
  conversationId: string,
  messageId: string,
  answers: string[]
): Promise<{ results: GradeResult[] }> {
  return request(`/api/conversations/${conversationId}/messages/${messageId}/grade`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

export function listUsers(): Promise<{ users: AdminUser[] }> {
  return request('/api/admin/users');
}

export function setUserRole(id: string, role: Role): Promise<{ ok: true }> {
  return request(`/api/admin/users/${id}/role`, { method: 'POST', body: JSON.stringify({ role }) });
}

/* ── Streaming ──────────────────────────────────────────────────────────── */

export interface StreamHandlers {
  onStart?: (info: { conversationId: string; isNewConversation: boolean }) => void;
  onDelta?: (text: string) => void;
  onTool?: (name: string) => void;
  onDone: (result: { conversationId: string; messageId: string; message: ModelContent }) => void;
  onError: (message: string) => void;
}

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/**
 * Frames are separated by a blank line. The separator is matched CRLF-tolerantly
 * because line endings depend on whoever is serving the stream — a proxy in front
 * of the Worker may rewrite them, and matching only `\n\n` would then parse nothing.
 */
const FRAME_SEPARATOR = /\r?\n\r?\n/;

function parseFrame(frame: string): { event: string; data: string } | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }

  return dataLines.length ? { event, data: dataLines.join('\n') } : null;
}

/**
 * Reads one SSE frame at a time out of a byte stream. A frame can straddle any
 * number of network reads, so the tail of the buffer is carried forward.
 */
async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let match = FRAME_SEPARATOR.exec(buffer);
    while (match) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      match = FRAME_SEPARATOR.exec(buffer);
      const parsed = parseFrame(frame);
      if (parsed) yield parsed;
    }
  }

  // A final frame with no trailing blank line would otherwise be dropped.
  if (buffer.trim()) {
    const parsed = parseFrame(buffer);
    if (parsed) yield parsed;
  }
}

/**
 * Streams a reply. Returns an abort function so the composer's stop button can
 * cut the turn short.
 *
 * Failures are surfaced through `onError` for the caller to show and offer a retry.
 * There is deliberately no automatic fall back to `sendMessage`: the turn's user
 * message and rate-limit quota are already committed server-side by the time the
 * stream can fail, so a silent second attempt would double-post the message.
 * `sendMessage` remains available for callers that cannot stream at all.
 */
export function sendMessageStream(
  message: string,
  conversationId: string | undefined,
  handlers: StreamHandlers
): () => void {
  const controller = new AbortController();

  (async () => {
    let settled = false;
    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        handlers.onError(body.error ?? GENERIC_ERROR);
        return;
      }

      for await (const frame of readSSE(res.body)) {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(frame.data) as Record<string, unknown>;
        } catch {
          continue;
        }

        switch (frame.event) {
          case 'start':
            handlers.onStart?.(payload as unknown as { conversationId: string; isNewConversation: boolean });
            break;
          case 'delta':
            handlers.onDelta?.(String(payload.text ?? ''));
            break;
          case 'tool':
            handlers.onTool?.(String(payload.name ?? ''));
            break;
          case 'done':
            settled = true;
            handlers.onDone(
              payload as unknown as { conversationId: string; messageId: string; message: ModelContent }
            );
            break;
          case 'error':
            settled = true;
            handlers.onError(String(payload.error ?? GENERIC_ERROR));
            break;
        }
      }

      // The stream closed without a verdict — a dropped connection mid-answer.
      if (!settled) handlers.onError('The connection dropped before the reply finished.');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      handlers.onError(GENERIC_ERROR);
    }
  })();

  return () => controller.abort();
}
