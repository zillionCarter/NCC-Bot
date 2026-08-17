import { describe, it, expect, vi } from 'vitest';
import {
  callGemini,
  streamGemini,
  searchGrounded,
  CHAT_MODEL,
  SUMMARY_MODEL,
  type StreamEvent,
} from '../src/gemini/client';

function mockResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

/** Emits the given SSE text in arbitrary chunks, to prove frame reassembly works. */
function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return Promise.resolve(new Response(stream, { status: 200 }));
}

async function collect(gen: AsyncGenerator<StreamEvent, void, void>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

describe('callGemini', () => {
  it('extracts plain text responses and targets the chat model', async () => {
    const fetchImpl = vi
      .fn()
      .mockReturnValue(mockResponse({ candidates: [{ content: { parts: [{ text: 'Hello there' }] } }] }));
    const result = await callGemini('key', 'system', [{ role: 'user', text: 'hi' }], [], fetchImpl);
    expect(result).toEqual({ text: 'Hello there', functionCall: null });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain(CHAT_MODEL);
    expect(url).toContain(':generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('key');
  });

  it('honours an explicit model, so summarization can stay on the cheap one', async () => {
    const fetchImpl = vi.fn().mockReturnValue(mockResponse({ candidates: [] }));
    await callGemini('key', 'system', [], [], fetchImpl, SUMMARY_MODEL);
    expect(fetchImpl.mock.calls[0][0]).toContain('gemini-3.5-flash-lite');
  });

  it('sends declared tools as functionDeclarations', async () => {
    const fetchImpl = vi.fn().mockReturnValue(mockResponse({ candidates: [] }));
    await callGemini('key', 'system', [], [{ name: 'render_table' }], fetchImpl);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.tools).toEqual([{ functionDeclarations: [{ name: 'render_table' }] }]);
  });

  it('omits the tools key entirely when there are none', async () => {
    const fetchImpl = vi.fn().mockReturnValue(mockResponse({ candidates: [] }));
    await callGemini('key', 'system', [], [], fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).not.toHaveProperty('tools');
  });

  it('extracts function calls', async () => {
    const fetchImpl = vi.fn().mockReturnValue(
      mockResponse({
        candidates: [{ content: { parts: [{ functionCall: { name: 'render_flashcards', args: { cards: [] } } }] } }],
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

describe('streamGemini', () => {
  it('parses the CRLF frame separator Gemini actually sends', async () => {
    // Regression: the wire format is `\r\n\r\n`, not `\n\n`. Matching only `\n\n`
    // found no frames at all, so every reply came back empty and the chat fell
    // through to "Sorry, I couldn't generate a response."
    const fetchImpl = vi.fn().mockReturnValue(
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello, "}],"role":"model"}}],"modelVersion":"gemini-3.5-flash"}\r\n\r\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"I am NCC Bot."}],"role":"model"}}]}\r\n\r\n',
      ])
    );
    const events = await collect(streamGemini('key', 'sys', [], [], fetchImpl));
    expect(events).toEqual([
      { kind: 'text', delta: 'Hello, ' },
      { kind: 'text', delta: 'I am NCC Bot.' },
    ]);
  });

  it('yields text deltas in order', async () => {
    const fetchImpl = vi.fn().mockReturnValue(
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}]}\n\n',
      ])
    );
    const events = await collect(streamGemini('key', 'sys', [], [], fetchImpl));
    expect(events).toEqual([
      { kind: 'text', delta: 'Hel' },
      { kind: 'text', delta: 'lo' },
    ]);
    expect(fetchImpl.mock.calls[0][0]).toContain(':streamGenerateContent?alt=sse');
  });

  it('ignores thoughtSignature-only metadata on a text part', async () => {
    // Gemini 3.x attaches thoughtSignature alongside the text; it must not be
    // mistaken for content or cause the part to be skipped.
    const fetchImpl = vi.fn().mockReturnValue(
      sseResponse(['data: {"candidates":[{"content":{"parts":[{"text":"ok","thoughtSignature":"abc"}]}}]}\r\n\r\n'])
    );
    expect(await collect(streamGemini('key', 'sys', [], [], fetchImpl))).toEqual([{ kind: 'text', delta: 'ok' }]);
  });

  it('emits a final frame that arrives without a trailing blank line', async () => {
    const fetchImpl = vi
      .fn()
      .mockReturnValue(sseResponse(['data: {"candidates":[{"content":{"parts":[{"text":"last"}]}}]}']));
    expect(await collect(streamGemini('key', 'sys', [], [], fetchImpl))).toEqual([{ kind: 'text', delta: 'last' }]);
  });

  it('reassembles a frame split across reads', async () => {
    // The network can split anywhere, including mid-JSON — a naive per-chunk parse
    // would drop this delta entirely.
    const fetchImpl = vi
      .fn()
      .mockReturnValue(sseResponse(['data: {"candidates":[{"content":{"par', 'ts":[{"text":"split"}]}}]}\r\n\r\n']));
    const events = await collect(streamGemini('key', 'sys', [], [], fetchImpl));
    expect(events).toEqual([{ kind: 'text', delta: 'split' }]);
  });

  it('reassembles a read that splits the CRLF separator itself', async () => {
    const fetchImpl = vi.fn().mockReturnValue(
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"a"}]}}]}\r\n\r',
        '\ndata: {"candidates":[{"content":{"parts":[{"text":"b"}]}}]}\r\n\r\n',
      ])
    );
    expect(await collect(streamGemini('key', 'sys', [], [], fetchImpl))).toEqual([
      { kind: 'text', delta: 'a' },
      { kind: 'text', delta: 'b' },
    ]);
  });

  it('yields a functionCall event when the model chooses a tool', async () => {
    const fetchImpl = vi.fn().mockReturnValue(
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"render_table","args":{"columns":["a"]}}}]}}]}\r\n\r\n',
      ])
    );
    const events = await collect(streamGemini('key', 'sys', [], [], fetchImpl));
    expect(events).toEqual([{ kind: 'functionCall', call: { name: 'render_table', args: { columns: ['a'] } } }]);
  });

  it('ignores keepalives, [DONE] sentinels and unparseable frames', async () => {
    const fetchImpl = vi.fn().mockReturnValue(
      sseResponse([
        ': keepalive\n\n',
        'data: \n\n',
        'data: not json\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n',
        'data: [DONE]\n\n',
      ])
    );
    const events = await collect(streamGemini('key', 'sys', [], [], fetchImpl));
    expect(events).toEqual([{ kind: 'text', delta: 'ok' }]);
  });

  it('throws on a non-OK response', async () => {
    const fetchImpl = vi.fn().mockReturnValue(Promise.resolve(new Response('nope', { status: 500 })));
    await expect(collect(streamGemini('key', 'sys', [], [], fetchImpl))).rejects.toThrow(/500/);
  });
});

describe('searchGrounded', () => {
  it('requests the google_search tool and returns chunks, queries and the entry point', async () => {
    const fetchImpl = vi.fn().mockReturnValue(
      mockResponse({
        candidates: [
          {
            content: { parts: [{ text: 'Start with the ABC piece.' }] },
            groundingMetadata: {
              groundingChunks: [{ web: { uri: 'https://redirect.test/a', title: 'abc.net.au' } }],
              webSearchQueries: ['macbeth ambition analysis'],
              searchEntryPoint: { renderedContent: '<div>chips</div>' },
            },
          },
        ],
      })
    );

    const result = await searchGrounded('key', 'find sources', fetchImpl);
    expect(result.text).toBe('Start with the ABC piece.');
    expect(result.chunks).toEqual([{ web: { uri: 'https://redirect.test/a', title: 'abc.net.au' } }]);
    expect(result.queries).toEqual(['macbeth ambition analysis']);
    expect(result.searchEntryPoint).toBe('<div>chips</div>');

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.tools).toEqual([{ google_search: {} }]);
    // Grounded calls must not also carry functionDeclarations — this is a
    // standalone lookup, not a turn of the conversation.
    expect(body).not.toHaveProperty('system_instruction');
  });

  it('returns empty collections when the model answered without grounding', async () => {
    const fetchImpl = vi.fn().mockReturnValue(mockResponse({ candidates: [{ content: { parts: [{ text: 'hm' }] } }] }));
    const result = await searchGrounded('key', 'q', fetchImpl);
    expect(result).toEqual({ text: 'hm', chunks: [], queries: [], searchEntryPoint: null });
  });

  it('throws on a non-OK response', async () => {
    const fetchImpl = vi.fn().mockReturnValue(Promise.resolve(new Response('quota', { status: 429 })));
    await expect(searchGrounded('key', 'q', fetchImpl)).rejects.toThrow(/429/);
  });
});
