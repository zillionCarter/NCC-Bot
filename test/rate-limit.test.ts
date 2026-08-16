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
    await db.createUser(env, 'rl-u2', 'r@school.edu.au', 'student');
    expect(await db.checkAndIncrementRateLimit(env, 'rl-u2', 1, 1)).toBe(true);
    expect(await db.checkAndIncrementRateLimit(env, 'rl-u2', 1, 1)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await db.checkAndIncrementRateLimit(env, 'rl-u2', 1, 1)).toBe(true);
  });
});
