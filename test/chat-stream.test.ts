import { describe, it, expect, vi, afterEach } from 'vitest';
import { SELF, env as rawEnv } from 'cloudflare:test';
import * as db from '../src/db';
import type { Env, ModelContent } from '../src/types';

const env = rawEnv as unknown as Env;

async function loginAs(userId: string, email: string) {
  await db.createUser(env, userId, email, 'student');
  const future = new Date(Date.now() + 60_000).toISOString();
  await db.createSession(env, `sess-${userId}`, userId, future);
  return { Cookie: `session=sess-${userId}`, 'Content-Type': 'application/json' };
}

/** Builds a fresh SSE Response per call — sharing one across requests throws in the pool. */
function sse(frames: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        controller.close();
      },
    }),
    { status: 200 }
  );
}

function textFrame(text: string) {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;
}

function callFrame(name: string, args: unknown) {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] })}\n\n`;
}

interface ParsedEvents {
  order: string[];
  deltas: string[];
  start?: { conversationId: string; isNewConversation: boolean };
  done?: { conversationId: string; messageId: string; message: ModelContent };
  error?: { error: string };
  tool?: { name: string };
}

async function readEvents(res: Response): Promise<ParsedEvents> {
  const body = await res.text();
  const parsed: ParsedEvents = { order: [], deltas: [] };
  for (const frame of body.split('\n\n')) {
    const eventLine = frame.split('\n').find((l) => l.startsWith('event:'));
    const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
    if (!eventLine || !dataLine) continue;
    const name = eventLine.slice(6).trim();
    const data = JSON.parse(dataLine.slice(5).trim());
    parsed.order.push(name);
    if (name === 'delta') parsed.deltas.push(data.text);
    else if (name === 'start') parsed.start = data;
    else if (name === 'done') parsed.done = data;
    else if (name === 'error') parsed.error = data;
    else if (name === 'tool') parsed.tool = data;
  }
  return parsed;
}

function post(headers: Record<string, string>, body: unknown) {
  return SELF.fetch('http://example.com/api/chat/stream', {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
}

describe('POST /api/chat/stream', () => {
  afterEach(() => vi.restoreAllMocks());

  it('401s without a session', async () => {
    const res = await SELF.fetch('http://example.com/api/chat/stream', {
      method: 'POST',
      body: JSON.stringify({ message: 'hi' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('400s on an empty message', async () => {
    const headers = await loginAs('st-u0', 'st0@school.edu.au');
    const res = await post(headers, { message: '  ' });
    expect(res.status).toBe(400);
  });

  it('streams deltas then a done event, and persists the assembled reply', async () => {
    const headers = await loginAs('st-u1', 'st1@school.edu.au');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(sse([textFrame('Photosynthesis '), textFrame('is how plants eat.')]))
    );

    const res = await post(headers, { message: 'what is photosynthesis' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

    const events = await readEvents(res);
    expect(events.order[0]).toBe('start');
    expect(events.order.at(-1)).toBe('done');
    expect(events.deltas).toEqual(['Photosynthesis ', 'is how plants eat.']);
    expect(events.start?.isNewConversation).toBe(true);
    expect(events.done?.message).toEqual({ type: 'text', text: 'Photosynthesis is how plants eat.' });

    const stored = await db.getRecentMessages(env, events.done!.conversationId, 10);
    const modelRow = stored.find((m) => m.id === events.done!.messageId);
    expect(JSON.parse(modelRow!.content)).toEqual({
      type: 'text',
      text: 'Photosynthesis is how plants eat.',
    });
  });

  it('reports an existing conversation as not new', async () => {
    const headers = await loginAs('st-u2', 'st2@school.edu.au');
    await db.createConversation(env, 'st-c2', 'st-u2', 'existing');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(sse([textFrame('ok')])));

    const events = await readEvents(await post(headers, { conversationId: 'st-c2', message: 'more' }));
    expect(events.start).toEqual({ conversationId: 'st-c2', isNewConversation: false });
  });

  it('404s on a conversation belonging to someone else', async () => {
    await loginAs('st-owner', 'stowner@school.edu.au');
    await db.createConversation(env, 'st-owned', 'st-owner', 'x');
    const intruder = await loginAs('st-intruder', 'stintruder@school.edu.au');
    const res = await post(intruder, { conversationId: 'st-owned', message: 'hi' });
    expect(res.status).toBe(404);
  });

  it('keeps the streamed explanation and pairs it with the card', async () => {
    const headers = await loginAs('st-u3', 'st3@school.edu.au');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        sse([
          textFrame('Let me draw that '),
          callFrame('render_diagram', { kind: 'flowchart', mermaid: 'flowchart TD\nA-->B' }),
        ])
      )
    );

    const events = await readEvents(await post(headers, { message: 'diagram the water cycle' }));
    expect(events.tool).toEqual({ name: 'render_diagram' });
    // The prose the model wrote introduces the card; discarding it was what made
    // diagrams arrive with no explanation at all.
    expect(events.done?.message).toEqual({
      type: 'composite',
      text: 'Let me draw that',
      artifact: {
        type: 'diagram',
        kind: 'flowchart',
        mermaid: 'flowchart TD\nA-->B',
        title: undefined,
        caption: undefined,
      },
    });
  });

  it('returns a bare card when the model offered no prose', async () => {
    const headers = await loginAs('st-u3b', 'st3b@school.edu.au');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(sse([callFrame('render_diagram', { kind: 'flowchart', mermaid: 'flowchart TD\nA-->B' })]))
    );

    const events = await readEvents(await post(headers, { message: 'diagram it' }));
    expect(events.done?.message.type).toBe('diagram');
  });

  it('redacts practice-test answers in the done event while storing them in full', async () => {
    const headers = await loginAs('st-u4', 'st4@school.edu.au');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        sse([
          callFrame('render_practice_test', {
            questions: [{ prompt: 'What is 2+2?', choices: ['3', '4'], correct_answer: '4', explanation: 'Addition.' }],
          }),
        ])
      )
    );

    const events = await readEvents(await post(headers, { message: 'quiz me' }));
    const message = events.done!.message;
    if (message.type !== 'practice_test') throw new Error('expected practice_test');
    expect(message.questions[0].correct_answer).toBe('');
    expect(message.questions[0].explanation).toBe('');

    const stored = await db.getMessageById(env, events.done!.messageId);
    const storedContent = JSON.parse(stored!.content) as ModelContent;
    if (storedContent.type !== 'practice_test') throw new Error('expected practice_test');
    expect(storedContent.questions[0].correct_answer).toBe('4');
  });

  it('resolves find_sources through a second grounded call', async () => {
    const headers = await loginAs('st-u5', 'st5@school.edu.au');
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve(sse([callFrame('find_sources', { topic: 'Macbeth' })]));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: 'Start with the first.' }] },
                groundingMetadata: {
                  groundingChunks: [{ web: { uri: 'https://r.test/1', title: 'abc.net.au' } }],
                },
              },
            ],
          }),
          { status: 200 }
        )
      );
    });

    const events = await readEvents(await post(headers, { message: 'find me sources on Macbeth' }));
    const message = events.done!.message;
    if (message.type !== 'sources') throw new Error('expected sources');
    expect(message.items).toEqual([{ title: 'abc.net.au', url: 'https://r.test/1', domain: 'abc.net.au' }]);
    expect(call).toBe(2);
  });

  it('emits an error event, not a thrown exception, when the model stream fails', async () => {
    const headers = await loginAs('st-u6', 'st6@school.edu.au');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('boom', { status: 500 })));

    const res = await post(headers, { message: 'hello' });
    // The SSE response has already begun, so the failure must arrive as an event
    // rather than an HTTP status the client can no longer see.
    expect(res.status).toBe(200);
    const events = await readEvents(res);
    expect(events.error?.error).toBeTruthy();
    expect(events.done).toBeUndefined();
  });

  it('emits an error event when a deferred tool fails', async () => {
    const headers = await loginAs('st-u7', 'st7@school.edu.au');
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve(sse([callFrame('find_sources', { topic: 'x' })]));
      return Promise.resolve(new Response('quota', { status: 429 }));
    });

    const events = await readEvents(await post(headers, { message: 'sources please' }));
    expect(events.error?.error).toBeTruthy();
    expect(events.done).toBeUndefined();
  });

  it('shares the rate-limit bucket with the non-streaming route', async () => {
    const headers = await loginAs('st-rl', 'strl@school.edu.au');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(sse([textFrame('ok')])));

    const statuses: number[] = [];
    for (let i = 0; i < 16; i++) {
      const res = await post(headers, { message: `msg ${i}` });
      statuses.push(res.status);
      await res.text();
    }
    expect(statuses[14]).toBe(200);
    expect(statuses[15]).toBe(429);
  });
});
