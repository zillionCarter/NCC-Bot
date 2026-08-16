import { describe, it, expect, vi } from 'vitest';
import { callGemini } from '../src/gemini/client';

function mockResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

describe('callGemini', () => {
  it('extracts plain text responses', async () => {
    const fetchImpl = vi.fn().mockReturnValue(
      mockResponse({ candidates: [{ content: { parts: [{ text: 'Hello there' }] } }] })
    );
    const result = await callGemini('key', 'system', [{ role: 'user', text: 'hi' }], [], fetchImpl);
    expect(result).toEqual({ text: 'Hello there', functionCall: null });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('gemini-3.5-flash-lite');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('key');
  });

  it('extracts function calls', async () => {
    const fetchImpl = vi.fn().mockReturnValue(
      mockResponse({
        candidates: [
          { content: { parts: [{ functionCall: { name: 'render_flashcards', args: { cards: [] } } }] } },
        ],
      })
    );
    const result = await callGemini('key', 'system', [], [], fetchImpl);
    expect(result).toEqual({ text: null, functionCall: { name: 'render_flashcards', args: { cards: [] } } });
  });

  it('throws with response body on a non-OK response', async () => {
    const fetchImpl = vi.fn().mockReturnValue(Promise.resolve(new Response('bad key', { status: 401 })));
    await expect(callGemini('key', 'system', [], [], fetchImpl)).rejects.toThrow(/401/);
  });
});
