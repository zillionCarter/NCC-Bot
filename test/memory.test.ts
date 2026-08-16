import { describe, it, expect, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type { Env, ModelContent } from '../src/types';
import * as db from '../src/db';
import { maybeSummarize, RECENT_MESSAGE_LIMIT } from '../src/memory';

const testEnv = env as unknown as Env;

// Model-role rows always store JSON-stringified ModelContent in the real app
// (see chat/routes.ts's db.addMessage call) — mirror that here so maybeSummarize's
// JSON.parse of model rows doesn't choke on plain test strings.
function contentFor(role: 'user' | 'model', text: string): string {
  return role === 'model' ? JSON.stringify({ type: 'text', text } satisfies ModelContent) : text;
}

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
      const role = i % 2 === 0 ? 'user' : 'model';
      await db.addMessage(testEnv, `m-${i}`, 'mem-c2', role, contentFor(role, `msg ${i}`));
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
      const role = i % 2 === 0 ? 'user' : 'model';
      await db.addMessage(testEnv, `m3-${i}`, 'mem-c3', role, contentFor(role, `msg ${i}`));
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
      const role = i % 2 === 0 ? 'user' : 'model';
      await db.addMessage(testEnv, `m4-${i}`, 'mem-c4', role, contentFor(role, `msg ${i}`));
    }

    // Mock Gemini to return whitespace-only string
    const callGeminiImpl = vi.fn().mockResolvedValue({ text: '   ', functionCall: null });
    await maybeSummarize(testEnv, 'mem-u4', 'mem-c4', callGeminiImpl);

    // Summary should be preserved, not overwritten with whitespace
    const newSummary = await db.getMemorySummary(testEnv, 'mem-u4');
    expect(newSummary).toBe(existingSummary);
    expect(await db.countMessages(testEnv, 'mem-c4')).toBe(RECENT_MESSAGE_LIMIT);
  });

  it('redacts practice-test answers from the transcript sent to Gemini for folding', async () => {
    await db.createUser(testEnv, 'mem-u5', 'i@school.edu.au', 'student');
    await db.createConversation(testEnv, 'mem-c5', 'mem-u5', 'convo');

    // Seed enough messages to trigger overflow, where the oldest (about-to-be-folded)
    // message is a model row containing a practice test with a real correct_answer.
    const practiceTestContent: ModelContent = {
      type: 'practice_test',
      questions: [
        {
          prompt: 'What is the capital of France?',
          choices: ['Paris', 'London'],
          correct_answer: 'Paris',
          explanation: 'Paris is the capital of France.',
        },
      ],
    };
    await db.addMessage(testEnv, 'm5-0', 'mem-c5', 'model', JSON.stringify(practiceTestContent));
    for (let i = 1; i < RECENT_MESSAGE_LIMIT + 2; i++) {
      const role = i % 2 === 0 ? 'user' : 'model';
      await db.addMessage(testEnv, `m5-${i}`, 'mem-c5', role, contentFor(role, `msg ${i}`));
    }

    const callGeminiImpl = vi.fn().mockResolvedValue({ text: 'Updated summary.', functionCall: null });
    await maybeSummarize(testEnv, 'mem-u5', 'mem-c5', callGeminiImpl);

    expect(callGeminiImpl).toHaveBeenCalledOnce();
    const prompt = callGeminiImpl.mock.calls[0][2][0].text as string;

    // The raw correct_answer/explanation must never appear verbatim in the prompt sent to Gemini.
    expect(prompt).not.toContain(practiceTestContent.questions[0].correct_answer);
    expect(prompt).not.toContain(practiceTestContent.questions[0].explanation);
    // But the redacted, human-readable trace (what modelContentToText produces) must be present.
    expect(prompt).toContain('[Generated a 1-question practice test]');
  });
});
