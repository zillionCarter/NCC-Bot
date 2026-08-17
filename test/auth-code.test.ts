import { describe, it, expect, vi, afterEach } from 'vitest';
import { SELF, env as rawEnv } from 'cloudflare:test';
import * as db from '../src/db';
import { generateCode, normalizeCode } from '../src/auth/tokens';
import type { Env } from '../src/types';

const env = rawEnv as unknown as Env;

function okResend() {
  return Promise.resolve(new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }));
}

async function requestLink(email: string) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => okResend());
  const res = await SELF.fetch('http://example.com/auth/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status).toBe(200);
  const row = await env.DB.prepare('SELECT token, code FROM magic_links WHERE email = ? ORDER BY expires_at DESC')
    .bind(email)
    .first<{ token: string; code: string }>();
  return row!;
}

function verifyCode(email: string, code: string) {
  return SELF.fetch('http://example.com/auth/verify-code', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('generateCode', () => {
  it('always produces six digits, zero-padded', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it('produces varied codes', () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateCode()));
    expect(seen.size).toBeGreaterThan(80);
  });
});

describe('normalizeCode', () => {
  it('strips the spaces and dashes people type', () => {
    expect(normalizeCode('123 456')).toBe('123456');
    expect(normalizeCode('123-456')).toBe('123456');
  });
});

describe('POST /auth/verify-code', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emails a code alongside the link and signs in when it is entered', async () => {
    const email = 'code1@school.edu.au';
    const { code } = await requestLink(email);
    expect(code).toMatch(/^\d{6}$/);

    const res = await verifyCode(email, code);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/session=/);
    expect(await db.getUserByEmail(env, email)).toBeTruthy();
  });

  it('includes the code in the email that is sent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => okResend());
    await SELF.fetch('http://example.com/auth/request', {
      method: 'POST',
      body: JSON.stringify({ email: 'code-email@school.edu.au' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    const row = await env.DB.prepare('SELECT code FROM magic_links WHERE email = ?')
      .bind('code-email@school.edu.au')
      .first<{ code: string }>();
    expect(body.html).toContain(row!.code);
    expect(body.subject).toContain(row!.code);
  });

  it('accepts a code typed with a space in the middle', async () => {
    const email = 'code-spaced@school.edu.au';
    const { code } = await requestLink(email);
    const res = await verifyCode(email, `${code.slice(0, 3)} ${code.slice(3)}`);
    expect(res.status).toBe(200);
  });

  it('is single-use', async () => {
    const email = 'code2@school.edu.au';
    const { code } = await requestLink(email);
    expect((await verifyCode(email, code)).status).toBe(200);
    expect((await verifyCode(email, code)).status).toBe(400);
  });

  it('rejects a code belonging to a different address', async () => {
    const { code } = await requestLink('code3@school.edu.au');
    const res = await verifyCode('someone-else@school.edu.au', code);
    expect(res.status).toBe(400);
  });

  it('rejects malformed codes without touching the database', async () => {
    for (const bad of ['', '12345', 'abcdef', '1234567']) {
      const res = await verifyCode('code4@school.edu.au', bad);
      expect(res.status).toBe(400);
    }
  });

  it('stops accepting a code once the attempt allowance is burned', async () => {
    const email = 'code5@school.edu.au';
    const { code } = await requestLink(email);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < db.MAX_CODE_ATTEMPTS; i++) {
      expect((await verifyCode(email, wrong)).status).toBe(400);
    }

    // The correct code must now be refused too — otherwise the allowance would
    // only slow a guessing loop down rather than stopping it.
    const res = await verifyCode(email, code);
    expect(res.status).toBe(400);
  });

  it('refuses an expired code', async () => {
    const email = 'code6@school.edu.au';
    await db.createMagicLink(env, 'expired-token', email, new Date(Date.now() - 1000).toISOString(), '424242');
    const res = await verifyCode(email, '424242');
    expect(res.status).toBe(400);
  });

  it('promotes the configured admin address on first sign-in via code', async () => {
    const adminEmail = env.ADMIN_EMAIL.trim().toLowerCase();
    const { code } = await requestLink(adminEmail);
    expect((await verifyCode(adminEmail, code)).status).toBe(200);
    expect((await db.getUserByEmail(env, adminEmail))?.role).toBe('admin');
  });
});
