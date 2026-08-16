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
