import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import type { Env } from '../src/types';
import * as db from '../src/db';

const testEnv = env as unknown as Env;

async function loginAs(userId: string, email: string, role: 'student' | 'teacher' | 'admin') {
  await db.createUser(testEnv, userId, email, role);
  const future = new Date(Date.now() + 60_000).toISOString();
  await db.createSession(testEnv, `sess-${userId}`, userId, future);
  return { Cookie: `session=sess-${userId}` };
}

describe('GET /api/conversations', () => {
  it('401s without a session', async () => {
    const res = await SELF.fetch('http://example.com/api/conversations');
    expect(res.status).toBe(401);
  });

  it('lists only the caller\'s conversations, most recent first', async () => {
    const headers = await loginAs('conv-u1', 'a@school.edu.au', 'student');
    await loginAs('conv-u2', 'b@school.edu.au', 'student');
    await db.createConversation(testEnv, 'conv-1', 'conv-u1', 'First chat');
    await new Promise((r) => setTimeout(r, 5));
    await db.createConversation(testEnv, 'conv-2', 'conv-u1', 'Second chat');
    await db.createConversation(testEnv, 'conv-other', 'conv-u2', 'Not mine');

    const res = await SELF.fetch('http://example.com/api/conversations', { headers });
    expect(res.status).toBe(200);
    const body = await res.json<{ conversations: { id: string; title: string | null }[] }>();
    expect(body.conversations.map((c) => c.id)).toEqual(['conv-2', 'conv-1']);
  });
});

describe('GET /api/conversations/:id', () => {
  it('404s for a conversation that does not belong to the caller', async () => {
    await loginAs('hist-owner', 'c@school.edu.au', 'student');
    await db.createConversation(testEnv, 'hist-conv', 'hist-owner', 'x');
    const other = await loginAs('hist-other', 'd@school.edu.au', 'student');

    const res = await SELF.fetch('http://example.com/api/conversations/hist-conv', { headers: other });
    expect(res.status).toBe(404);
  });

  it('returns full history with practice-test answers redacted', async () => {
    const headers = await loginAs('hist-u1', 'e@school.edu.au', 'student');
    await db.createConversation(testEnv, 'hist-conv-2', 'hist-u1', 'x');
    await db.addMessage(testEnv, 'msg-1', 'hist-conv-2', 'user', 'give me a practice test');
    await db.addMessage(
      testEnv,
      'msg-2',
      'hist-conv-2',
      'model',
      JSON.stringify({
        type: 'practice_test',
        questions: [{ prompt: 'What is 2+2?', choices: ['3', '4'], correct_answer: '4', explanation: 'because' }],
      })
    );

    const res = await SELF.fetch('http://example.com/api/conversations/hist-conv-2', { headers });
    expect(res.status).toBe(200);
    const body = await res.json<{ messages: { id: string; role: string; content: any }[] }>();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].content).toEqual({ type: 'text', text: 'give me a practice test' });
    expect(body.messages[1].content.type).toBe('practice_test');
    expect(body.messages[1].content.questions[0].correct_answer).toBe('');
    expect(body.messages[1].content.questions[0].explanation).toBe('');
  });
});
