import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendMessageStream, type StreamHandlers } from './client';

/** Serves the given SSE text in arbitrary chunks, to exercise frame reassembly. */
function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200 }
  );
}

function frame(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function collectHandlers() {
  const deltas: string[] = [];
  const tools: string[] = [];
  const handlers: StreamHandlers = {
    onStart: vi.fn(),
    onDelta: (text) => deltas.push(text),
    onTool: (name) => tools.push(name),
    onDone: vi.fn(),
    onError: vi.fn(),
  };
  return { handlers, deltas, tools };
}

/** Resolves once the stream reader has drained and a terminal handler has fired. */
async function settled(handlers: StreamHandlers) {
  await vi.waitFor(() => {
    const done = handlers.onDone as ReturnType<typeof vi.fn>;
    const failed = handlers.onError as ReturnType<typeof vi.fn>;
    expect(done.mock.calls.length + failed.mock.calls.length).toBeGreaterThan(0);
  });
}

afterEach(() => vi.restoreAllMocks());

describe('sendMessageStream', () => {
  it('reports start, deltas and the finished message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        frame('start', { conversationId: 'c1', isNewConversation: true }),
        frame('delta', { text: 'Hel' }),
        frame('delta', { text: 'lo' }),
        frame('done', { conversationId: 'c1', messageId: 'm1', message: { type: 'text', text: 'Hello' } }),
      ])
    );

    const { handlers, deltas } = collectHandlers();
    sendMessageStream('hi', undefined, handlers);
    await settled(handlers);

    expect(handlers.onStart).toHaveBeenCalledWith({ conversationId: 'c1', isNewConversation: true });
    expect(deltas).toEqual(['Hel', 'lo']);
    expect(handlers.onDone).toHaveBeenCalledWith({
      conversationId: 'c1',
      messageId: 'm1',
      message: { type: 'text', text: 'Hello' },
    });
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('parses CRLF-separated frames, in case a proxy rewrites line endings', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        'event: delta\r\ndata: {"text":"crlf"}\r\n\r\n',
        'event: done\r\ndata: {"conversationId":"c1","messageId":"m1","message":{"type":"text","text":"crlf"}}\r\n\r\n',
      ])
    );

    const { handlers, deltas } = collectHandlers();
    sendMessageStream('hi', undefined, handlers);
    await settled(handlers);

    expect(deltas).toEqual(['crlf']);
    expect(handlers.onDone).toHaveBeenCalled();
  });

  it('reassembles a frame split mid-JSON across reads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        'event: delta\ndata: {"text":"spl',
        'it"}\n\n',
        frame('done', { conversationId: 'c1', messageId: 'm1', message: { type: 'text', text: 'split' } }),
      ])
    );

    const { handlers, deltas } = collectHandlers();
    sendMessageStream('hi', undefined, handlers);
    await settled(handlers);

    expect(deltas).toEqual(['split']);
  });

  it('surfaces a tool event', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        frame('tool', { name: 'render_diagram' }),
        frame('done', { conversationId: 'c1', messageId: 'm1', message: { type: 'text', text: '' } }),
      ])
    );

    const { handlers, tools } = collectHandlers();
    sendMessageStream('hi', undefined, handlers);
    await settled(handlers);

    expect(tools).toEqual(['render_diagram']);
  });

  it('passes an error event through to onError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([frame('error', { error: 'NCC Bot is unavailable right now.' })])
    );

    const { handlers } = collectHandlers();
    sendMessageStream('hi', undefined, handlers);
    await settled(handlers);

    expect(handlers.onError).toHaveBeenCalledWith('NCC Bot is unavailable right now.');
    expect(handlers.onDone).not.toHaveBeenCalled();
  });

  it('reports the server error message on a non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Too many messages' }), { status: 429 })
    );

    const { handlers } = collectHandlers();
    sendMessageStream('hi', undefined, handlers);
    await settled(handlers);

    expect(handlers.onError).toHaveBeenCalledWith('Too many messages');
  });

  it('reports a dropped connection when the stream ends with no verdict', async () => {
    // A stream that closes after deltas but before done means the answer was cut
    // off — silently accepting it would leave a truncated reply looking complete.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse([frame('delta', { text: 'partial' })]));

    const { handlers } = collectHandlers();
    sendMessageStream('hi', undefined, handlers);
    await settled(handlers);

    expect(handlers.onError).toHaveBeenCalledWith('The connection dropped before the reply finished.');
  });

  it('ignores unparseable frames instead of failing the turn', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        'event: delta\ndata: not json\n\n',
        frame('delta', { text: 'ok' }),
        frame('done', { conversationId: 'c1', messageId: 'm1', message: { type: 'text', text: 'ok' } }),
      ])
    );

    const { handlers, deltas } = collectHandlers();
    sendMessageStream('hi', undefined, handlers);
    await settled(handlers);

    expect(deltas).toEqual(['ok']);
    expect(handlers.onDone).toHaveBeenCalled();
  });

  it('sends the message and conversation id as JSON', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([frame('done', { conversationId: 'c9', messageId: 'm1', message: { type: 'text', text: '' } })])
    );

    const { handlers } = collectHandlers();
    sendMessageStream('hello there', 'c9', handlers);
    await settled(handlers);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/chat/stream');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      message: 'hello there',
      conversationId: 'c9',
    });
  });

  it('stays silent when the caller aborts', async () => {
    // Aborting is a deliberate user action (the Stop button), not a failure.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 0))
    );

    const { handlers } = collectHandlers();
    const abort = sendMessageStream('hi', undefined, handlers);
    abort();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onDone).not.toHaveBeenCalled();
  });
});
