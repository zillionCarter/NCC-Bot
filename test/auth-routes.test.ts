import { describe, it, expect, vi, afterEach } from 'vitest';
import { SELF, env as rawEnv } from 'cloudflare:test';
import type { Env } from '../src/types';
import * as db from '../src/db';

const env = rawEnv as unknown as Env;

describe('POST /auth/request', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects non-.edu.au emails without calling Resend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await SELF.fetch('http://example.com/auth/request', {
      method: 'POST',
      body: JSON.stringify({ email: 'student@gmail.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts a .edu.au email and returns ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const res = await SELF.fetch('http://example.com/auth/request', {
      method: 'POST',
      body: JSON.stringify({ email: 'student@newman.edu.au' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects numeric email without calling Resend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await SELF.fetch('http://example.com/auth/request', {
      method: 'POST',
      body: JSON.stringify({ email: 123 }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects null body without calling Resend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await SELF.fetch('http://example.com/auth/request', {
      method: 'POST',
      body: 'null',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('GET /auth/verify', () => {
  it('rejects an unknown token', async () => {
    const res = await SELF.fetch('http://example.com/auth/verify?token=nope', { redirect: 'manual' });
    expect(res.status).toBe(400);
  });

  it('creates a student on first login and sets a session cookie', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    await db.createMagicLink(env, 'good-token', 'newstudent@newman.edu.au', future);

    const res = await SELF.fetch('http://example.com/auth/verify?token=good-token', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('set-cookie')).toMatch(/session=/);

    const user = await db.getUserByEmail(env, 'newstudent@newman.edu.au');
    expect(user?.role).toBe('student');
  });

  it('promotes the configured ADMIN_EMAIL to admin on first login', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    await db.createMagicLink(env, 'admin-token', env.ADMIN_EMAIL, future);
    await SELF.fetch('http://example.com/auth/verify?token=admin-token', { redirect: 'manual' });
    const user = await db.getUserByEmail(env, env.ADMIN_EMAIL);
    expect(user?.role).toBe('admin');
  });
});
