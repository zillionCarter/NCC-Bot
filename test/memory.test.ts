import { describe, it, expect, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type { Env } from '../src/types';
import * as db from '../src/db';
import { maybeSummarize, RECENT_MESSAGE_LIMIT } from '../src/memory';

const testEnv = env as unknown as Env;

describe('maybeSummarize', () => {
  it('does nothing when under the limit', async () => {
    await db.createUser(testEnv, 'mem-u1', 'e@school.edu.au', 'student');
    await db.createConversation(testEnv, 'mem-c1', 'mem-u1', 'convo');
    await db.addMessage(testEnv, 'm1', 'mem-c1', 'user', 'hi');

    const callGeminiImpl = vi.fn();
    await maybeSummarize(testEnv, 'mem-u1', 'mem-c1', callGeminiImpl);
    expect(callGeminiImpl).not.toHaveBeenCalled();
  });

  it('folds the oldest overflow messages into the summary and deletes them', async () => {
    await db.createUser(testEnv, 'mem-u2', 'f@school.edu.au', 'student');
    await db.createConversation(testEnv, 'mem-c2', 'mem-u2', 'convo');
    for (let i = 0; i < RECENT_MESSAGE_LIMIT + 3; i++) {
      await db.addMessage(testEnv, `m-${i}`, 'mem-c2', i % 2 === 0 ? 'user' : 'model', `msg ${i}`);
    }

    const callGeminiImpl = vi.fn().mockResolvedValue({ text: 'Updated summary.', functionCall: null });
    await maybeSummarize(testEnv, 'mem-u2', 'mem-c2', callGeminiImpl);

    expect(callGeminiImpl).toHaveBeenCalledOnce();
    expect(await db.getMemorySummary(testEnv, 'mem-u2')).toBe('Updated summary.');
    expect(await db.countMessages(testEnv, 'mem-c2')).toBe(RECENT_MESSAGE_LIMIT);
  });
});
