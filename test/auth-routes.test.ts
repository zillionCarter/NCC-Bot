import { describe, it, expect, vi, afterEach } from 'vitest';
import { SELF } from 'cloudflare:test';

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
});
