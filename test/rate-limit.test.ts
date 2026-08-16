import { describe, it, expect } from 'vitest';
import { env as rawEnv } from 'cloudflare:test';
import * as db from '../src/db';
import type { Env } from '../src/types';

const env = rawEnv as unknown as Env;

describe('checkAndIncrementRateLimit', () => {
  it('allows requests under the limit and denies the one that exceeds it', async () => {
    await db.createUser(env, 'rl-u1', 'q@school.edu.au', 'student');
    for (let i = 0; i < 5; i++) {
      expect(await db.checkAndIncrementRateLimit(env, 'rl-u1', 60_000, 5)).toBe(true);
    }
    expect(await db.checkAndIncrementRateLimit(env, 'rl-u1', 60_000, 5)).toBe(false);
  });

  it('resets the count once the window has elapsed', async () => {
    // windowMs is set well above real D1 I/O latency (rather than the brief's original 1ms)
    // so the first two calls reliably land inside the window and the third reliably lands
    // after it — see the fix report for why a 1ms window flaked under the atomic boundary.
    await db.createUser(env, 'rl-u2', 'r@school.edu.au', 'student');
    expect(await db.checkAndIncrementRateLimit(env, 'rl-u2', 25, 1)).toBe(true);
    expect(await db.checkAndIncrementRateLimit(env, 'rl-u2', 25, 1)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(await db.checkAndIncrementRateLimit(env, 'rl-u2', 25, 1)).toBe(true);
  });
});
