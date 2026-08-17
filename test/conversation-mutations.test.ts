import { describe, it, expect } from 'vitest';
import { SELF, env as rawEnv } from 'cloudflare:test';
import * as db from '../src/db';
import type { Env } from '../src/types';

const env = rawEnv as unknown as Env;

async function loginAs(userId: string, email: string) {
  await db.createUser(env, userId, email, 'student');
  const future = new Date(Date.now() + 60_000).toISOString();
  await db.createSession(env, `sess-${userId}`, userId, future);
  return { Cookie: `session=sess-${userId}`, 'Content-Type': 'application/json' };
}

describe('PATCH /api/conversations/:id', () => {
  it('renames a conversation the caller owns', async () => {
    const headers = await loginAs('cm-u1', 'cm1@school.edu.au');
    await db.createConversation(env, 'cm-c1', 'cm-u1', 'old title');

    const res = await SELF.fetch('http://example.com/api/conversations/cm-c1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Quadratics revision' }),
      headers,
    });
    expect(res.status).toBe(200);
    const list = await db.listConversations(env, 'cm-u1');
    expect(list.find((c) => c.id === 'cm-c1')?.title).toBe('Quadratics revision');
  });

  it('401s without a session', async () => {
    const res = await SELF.fetch('http://example.com/api/conversations/cm-c1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'x' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('400s on an empty title and 400s on an over-long one', async () => {
    const headers = await loginAs('cm-u2', 'cm2@school.edu.au');
    await db.createConversation(env, 'cm-c2', 'cm-u2', 'x');

    const empty = await SELF.fetch('http://example.com/api/conversations/cm-c2', {
      method: 'PATCH',
      body: JSON.stringify({ title: '   ' }),
      headers,
    });
    expect(empty.status).toBe(400);

    const long = await SELF.fetch('http://example.com/api/conversations/cm-c2', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'a'.repeat(121) }),
      headers,
    });
    expect(long.status).toBe(400);
  });

  it("404s rather than renaming someone else's conversation", async () => {
    await loginAs('cm-owner', 'cmowner@school.edu.au');
    await db.createConversation(env, 'cm-owned', 'cm-owner', 'private');
    const intruder = await loginAs('cm-intruder', 'cmintruder@school.edu.au');

    const res = await SELF.fetch('http://example.com/api/conversations/cm-owned', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'hijacked' }),
      headers: intruder,
    });
    expect(res.status).toBe(404);
    const list = await db.listConversations(env, 'cm-owner');
    expect(list.find((c) => c.id === 'cm-owned')?.title).toBe('private');
  });
});

describe('DELETE /api/conversations/:id', () => {
  it('deletes the conversation and its messages', async () => {
    const headers = await loginAs('cm-u3', 'cm3@school.edu.au');
    await db.createConversation(env, 'cm-c3', 'cm-u3', 'to go');
    await db.addMessage(env, 'cm-m1', 'cm-c3', 'user', 'hello');
    await db.addMessage(env, 'cm-m2', 'cm-c3', 'model', JSON.stringify({ type: 'text', text: 'hi' }));

    const res = await SELF.fetch('http://example.com/api/conversations/cm-c3', { method: 'DELETE', headers });
    expect(res.status).toBe(200);
    expect(await db.listConversations(env, 'cm-u3')).toHaveLength(0);
    expect(await db.countMessages(env, 'cm-c3')).toBe(0);
  });

  it("404s and leaves messages intact for someone else's conversation", async () => {
    await loginAs('cm-owner2', 'cmowner2@school.edu.au');
    await db.createConversation(env, 'cm-owned2', 'cm-owner2', 'private');
    await db.addMessage(env, 'cm-m3', 'cm-owned2', 'user', 'secret');
    const intruder = await loginAs('cm-intruder2', 'cmintruder2@school.edu.au');

    const res = await SELF.fetch('http://example.com/api/conversations/cm-owned2', {
      method: 'DELETE',
      headers: intruder,
    });
    expect(res.status).toBe(404);
    // The ownership check guards the message delete too, not just the row delete.
    expect(await db.countMessages(env, 'cm-owned2')).toBe(1);
  });

  it('404s for a conversation that does not exist', async () => {
    const headers = await loginAs('cm-u4', 'cm4@school.edu.au');
    const res = await SELF.fetch('http://example.com/api/conversations/nope', { method: 'DELETE', headers });
    expect(res.status).toBe(404);
  });
});
