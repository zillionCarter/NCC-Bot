import { describe, it, expect, vi, afterEach } from 'vitest';
import { SELF, env as rawEnv } from 'cloudflare:test';
import * as db from '../src/db';
import type { Env, ModelContent } from '../src/types';

const env = rawEnv as unknown as Env;

async function loginAs(userId: string, email: string, role: 'student' | 'teacher' | 'admin') {
  await db.createUser(env, userId, email, role);
  const future = new Date(Date.now() + 60_000).toISOString();
  await db.createSession(env, `sess-${userId}`, userId, future);
  return { Cookie: `session=sess-${userId}` };
}

describe('POST /api/chat', () => {
  afterEach(() => vi.restoreAllMocks());

  it('401s without a session', async () => {
    const res = await SELF.fetch('http://example.com/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'hi' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('400s on an empty message', async () => {
    const headers = await loginAs('chat-u1', 'g@school.edu.au', 'student');
    const res = await SELF.fetch('http://example.com/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: '   ' }),
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('creates a conversation, calls Gemini, and returns a text reply', async () => {
    const headers = await loginAs('chat-u2', 'h@school.edu.au', 'student');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: 'An API is...' }] } }] }),
          { status: 200 }
        )
      )
    );

    const res = await SELF.fetch('http://example.com/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'what is an api' }),
      headers: { ...headers, 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(200);
    const body = await res.json<{ conversationId: string; message: { type: string; text: string } }>();
    expect(body.message).toEqual({ type: 'text', text: 'An API is...' });
    expect(body.conversationId).toBeTruthy();
  });

  it('rejects a conversationId that does not belong to the caller', async () => {
    const owner = await loginAs('chat-u3', 'i@school.edu.au', 'student');
    await db.createConversation(env, 'not-yours', 'chat-u3', 'x');
    const other = await loginAs('chat-u4', 'j@school.edu.au', 'student');

    const res = await SELF.fetch('http://example.com/api/chat', {
      method: 'POST',
      body: JSON.stringify({ conversationId: 'not-yours', message: 'hi' }),
      headers: { ...other, 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('redacts practice-test answers in the client response but stores the full content in D1', async () => {
    const headers = await loginAs('chat-u5', 'k@school.edu.au', 'student');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: 'render_practice_test',
                        args: {
                          questions: [
                            {
                              prompt: 'What is 2 + 2?',
                              choices: ['3', '4', '5'],
                              correct_answer: '4',
                              explanation: 'Because 2 + 2 = 4.',
                            },
                            {
                              prompt: 'What is the capital of France?',
                              choices: ['Paris', 'London'],
                              correct_answer: 'Paris',
                              explanation: 'Paris is the capital of France.',
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      )
    );

    const res = await SELF.fetch('http://example.com/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'give me a practice test' }),
      headers: { ...headers, 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(200);
    const body = await res.json<{
      conversationId: string;
      message: { type: string; questions: { prompt: string; correct_answer: string; explanation: string }[] };
    }>();

    expect(body.message.type).toBe('practice_test');
    expect(body.message.questions).toHaveLength(2);
    for (const q of body.message.questions) {
      expect(q.correct_answer).toBe('');
      expect(q.explanation).toBe('');
      expect(q.prompt).toBeTruthy();
    }

    // The stored row in D1 must retain the full, unredacted content.
    const stored = await db.getRecentMessages(env, body.conversationId, 10);
    const modelRow = stored.find((m) => m.role === 'model');
    expect(modelRow).toBeTruthy();
    const storedContent = JSON.parse(modelRow!.content) as ModelContent;
    if (storedContent.type !== 'practice_test') throw new Error('expected practice_test');
    expect(storedContent.questions[0].correct_answer).toBe('4');
    expect(storedContent.questions[0].explanation).toBe('Because 2 + 2 = 4.');
    expect(storedContent.questions[1].correct_answer).toBe('Paris');
    expect(storedContent.questions[1].explanation).toBe('Paris is the capital of France.');
  });

  it('429s once the per-user rate limit is exceeded', async () => {
    const headers = await loginAs('chat-rl', 's@school.edu.au', 'student');
    // Use mockImplementation (not mockResolvedValue) so a fresh Response is constructed
    // on every call — under vitest-pool-workers, sharing a single Response instance across
    // multiple SELF.fetch-triggered requests throws "Cannot perform I/O on behalf of a
    // different request" when the body is read in a later request's handler.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 })
      )
    );

    let lastStatus = 0;
    for (let i = 0; i < 16; i++) {
      const res = await SELF.fetch('http://example.com/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: `msg ${i}` }),
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
