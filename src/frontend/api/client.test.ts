import { describe, it, expect, vi, afterEach } from 'vitest';
import { getMe, sendMessage, ApiError } from './client';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('getMe parses the user on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'u1', email: 'a@b.edu.au', role: 'student' } }), { status: 200 })
    );
    const result = await getMe();
    expect(result.user.id).toBe('u1');
  });

  it('throws ApiError with the server message on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    );
    await expect(getMe()).rejects.toThrow('unauthorized');
    await expect(getMe()).rejects.toBeInstanceOf(ApiError);
  });

  it('sendMessage posts the message and optional conversationId', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversationId: 'c1', messageId: 'm1', message: { type: 'text', text: 'hi' } }), {
        status: 200,
      })
    );
    await sendMessage('hello', 'c1');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ message: 'hello', conversationId: 'c1' }) })
    );
  });
});
