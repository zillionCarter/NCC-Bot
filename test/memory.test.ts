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

    // Verify the OLDEST messages were deleted, not the newest
    const remaining = await db.getRecentMessages(testEnv, 'mem-c2', RECENT_MESSAGE_LIMIT + 5);
    const remainingIds = remaining.map((m) => m.id);

    // m-0, m-1, m-2 (the 3 oldest) should be gone
    expect(remainingIds).not.toContain('m-0');
    expect(remainingIds).not.toContain('m-1');
    expect(remainingIds).not.toContain('m-2');

    // m-3 through m-22 (the 20 most recent) should remain
    for (let i = 3; i < RECENT_MESSAGE_LIMIT + 3; i++) {
      expect(remainingIds).toContain(`m-${i}`);
    }
  });

  it('preserves existing summary when Gemini returns empty text', async () => {
    await db.createUser(testEnv, 'mem-u3', 'g@school.edu.au', 'student');
    await db.createConversation(testEnv, 'mem-c3', 'mem-u3', 'convo');

    // Seed an existing summary
    const existingSummary = 'Student struggles with fractions.';
    await db.setMemorySummary(testEnv, 'mem-u3', existingSummary);

    // Create overflow messages
    for (let i = 0; i < RECENT_MESSAGE_LIMIT + 2; i++) {
      await db.addMessage(testEnv, `m3-${i}`, 'mem-c3', i % 2 === 0 ? 'user' : 'model', `msg ${i}`);
    }

    // Mock Gemini to return empty string (e.g., safety-filtered response)
    const callGeminiImpl = vi.fn().mockResolvedValue({ text: '', functionCall: null });
    await maybeSummarize(testEnv, 'mem-u3', 'mem-c3', callGeminiImpl);

    // Summary should be preserved, not overwritten with empty string
    const newSummary = await db.getMemorySummary(testEnv, 'mem-u3');
    expect(newSummary).toBe(existingSummary);
    expect(await db.countMessages(testEnv, 'mem-c3')).toBe(RECENT_MESSAGE_LIMIT);
  });

  it('preserves existing summary when Gemini returns whitespace-only text', async () => {
    await db.createUser(testEnv, 'mem-u4', 'h@school.edu.au', 'student');
    await db.createConversation(testEnv, 'mem-c4', 'mem-u4', 'convo');

    // Seed an existing summary
    const existingSummary = 'Student excels at word problems.';
    await db.setMemorySummary(testEnv, 'mem-u4', existingSummary);

    // Create overflow messages
    for (let i = 0; i < RECENT_MESSAGE_LIMIT + 1; i++) {
      await db.addMessage(testEnv, `m4-${i}`, 'mem-c4', i % 2 === 0 ? 'user' : 'model', `msg ${i}`);
    }

    // Mock Gemini to return whitespace-only string
    const callGeminiImpl = vi.fn().mockResolvedValue({ text: '   ', functionCall: null });
    await maybeSummarize(testEnv, 'mem-u4', 'mem-c4', callGeminiImpl);

    // Summary should be preserved, not overwritten with whitespace
    const newSummary = await db.getMemorySummary(testEnv, 'mem-u4');
    expect(newSummary).toBe(existingSummary);
    expect(await db.countMessages(testEnv, 'mem-c4')).toBe(RECENT_MESSAGE_LIMIT);
  });
});
