import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { env as rawEnv } from 'cloudflare:test';
import type { Env } from '../src/types';
import type { AppEnv } from '../src/index';
import { requireAuth, requireRole } from '../src/auth/middleware';
import * as db from '../src/db';

const env = rawEnv as unknown as Env;

function testApp() {
  const app = new Hono<AppEnv>();
  app.get('/protected', requireAuth, (c) => c.json({ userId: c.get('user').id }));
  app.get('/admin-only', requireAuth, requireRole('admin'), (c) => c.json({ ok: true }));
  return app;
}

describe('requireAuth', () => {
  it('401s with no session cookie', async () => {
    const res = await testApp().request('/protected', {}, env);
    expect(res.status).toBe(401);
  });

  it('401s with an expired session token', async () => {
    await db.createUser(env, 'u-exp', 'expired@newman.edu.au', 'student');
    const past = new Date(Date.now() - 60_000).toISOString();
    await db.createSession(env, 'sess-expired', 'u-exp', past);

    const res = await testApp().request('/protected', { headers: { Cookie: 'session=sess-expired' } }, env);
    expect(res.status).toBe(401);
  });

  it('401s with an invalid session token', async () => {
    const res = await testApp().request('/protected', { headers: { Cookie: 'session=nonexistent' } }, env);
    expect(res.status).toBe(401);
  });

  it('passes through with a valid session and exposes the user', async () => {
    await db.createUser(env, 'u1', 'student@newman.edu.au', 'student');
    const future = new Date(Date.now() + 60_000).toISOString();
    await db.createSession(env, 'sess-ok', 'u1', future);

    const res = await testApp().request('/protected', { headers: { Cookie: 'session=sess-ok' } }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'u1' });
  });
});

describe('requireRole', () => {
  it('403s a student hitting an admin-only route', async () => {
    await db.createUser(env, 'u2', 'student2@newman.edu.au', 'student');
    const future = new Date(Date.now() + 60_000).toISOString();
    await db.createSession(env, 'sess-student', 'u2', future);

    const res = await testApp().request('/admin-only', { headers: { Cookie: 'session=sess-student' } }, env);
    expect(res.status).toBe(403);
  });

  it('allows an admin through the admin-only route', async () => {
    await db.createUser(env, 'u3', 'admin@newman.edu.au', 'admin');
    const future = new Date(Date.now() + 60_000).toISOString();
    await db.createSession(env, 'sess-admin', 'u3', future);

    const res = await testApp().request('/admin-only', { headers: { Cookie: 'session=sess-admin' } }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
