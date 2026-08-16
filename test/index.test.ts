import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('health check', () => {
  it('GET /health returns ok', async () => {
    const res = await SELF.fetch('http://example.com/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
