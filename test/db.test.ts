import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { Env } from '../src/types';
import * as db from '../src/db';

const testEnv = env as unknown as Env;

describe('db', () => {
  it('creates a user and fetches by email and id', async () => {
    const user = await db.createUser(testEnv, 'user-1', 'student@school.edu.au', 'student');
    expect(user.role).toBe('student');

    const byEmail = await db.getUserByEmail(testEnv, 'student@school.edu.au');
    expect(byEmail?.id).toBe('user-1');

    const byId = await db.getUserById(testEnv, 'user-1');
    expect(byId?.email).toBe('student@school.edu.au');
  });

  it('magic link can be consumed exactly once', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    await db.createMagicLink(testEnv, 'tok-1', 'a@school.edu.au', future);

    const first = await db.consumeMagicLink(testEnv, 'tok-1');
    expect(first?.email).toBe('a@school.edu.au');

    const second = await db.consumeMagicLink(testEnv, 'tok-1');
    expect(second).toBeNull();
  });

  it('expired magic link cannot be consumed', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await db.createMagicLink(testEnv, 'tok-2', 'b@school.edu.au', past);
    const result = await db.consumeMagicLink(testEnv, 'tok-2');
    expect(result).toBeNull();
  });

  it('session lookup respects expiry', async () => {
    await db.createUser(testEnv, 'user-2', 'staff@school.edu.au', 'teacher');
    const future = new Date(Date.now() + 60_000).toISOString();
    await db.createSession(testEnv, 'sess-1', 'user-2', future);
    const found = await db.getSessionUser(testEnv, 'sess-1');
    expect(found?.id).toBe('user-2');

    const past = new Date(Date.now() - 60_000).toISOString();
    await db.createSession(testEnv, 'sess-2', 'user-2', past);
    const expired = await db.getSessionUser(testEnv, 'sess-2');
    expect(expired).toBeNull();
  });

  it('rolling memory summary can be created then updated (upsert)', async () => {
    await db.createUser(testEnv, 'user-3', 'c@school.edu.au', 'student');
    await db.setMemorySummary(testEnv, 'user-3', 'First summary.');
    expect(await db.getMemorySummary(testEnv, 'user-3')).toBe('First summary.');
    await db.setMemorySummary(testEnv, 'user-3', 'Updated summary.');
    expect(await db.getMemorySummary(testEnv, 'user-3')).toBe('Updated summary.');
  });

  it('conversation message helpers: add, recent window, oldest-N, delete', async () => {
    await db.createUser(testEnv, 'user-4', 'd@school.edu.au', 'student');
    await db.createConversation(testEnv, 'conv-1', 'user-4', 'Test convo');

    for (let i = 0; i < 5; i++) {
      await db.addMessage(testEnv, `m-${i}`, 'conv-1', i % 2 === 0 ? 'user' : 'model', `msg ${i}`);
    }

    expect(await db.countMessages(testEnv, 'conv-1')).toBe(5);

    const recent = await db.getRecentMessages(testEnv, 'conv-1', 3);
    expect(recent.map((m) => m.content)).toEqual(['msg 2', 'msg 3', 'msg 4']);

    const oldest = await db.getOldestMessages(testEnv, 'conv-1', 2);
    expect(oldest.map((m) => m.content)).toEqual(['msg 0', 'msg 1']);

    await db.deleteMessages(testEnv, oldest.map((m) => m.id));
    expect(await db.countMessages(testEnv, 'conv-1')).toBe(3);
  });
});
