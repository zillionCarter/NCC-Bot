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

describe('GET /api/me', () => {
  it('401s without a session', async () => {
    const res = await SELF.fetch('http://example.com/api/me');
    expect(res.status).toBe(401);
  });

  it('returns the logged-in user', async () => {
    const headers = await loginAs('me-u1', 'a@school.edu.au', 'student');
    const res = await SELF.fetch('http://example.com/api/me', { headers });
    expect(res.status).toBe(200);
    const body = await res.json<{ user: { id: string; email: string; role: string; onboarded: number } }>();
    expect(body.user.id).toBe('me-u1');
    expect(body.user.email).toBe('a@school.edu.au');
    expect(body.user.role).toBe('student');
    expect(body.user.onboarded).toBe(0);
  });
});
