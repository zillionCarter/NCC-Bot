import type { Env, Message, ModelContent } from './types';
import * as db from './db';
import { callGemini, SUMMARY_MODEL } from './gemini/client';
import { modelContentToText } from './gemini/tools';

/**
 * How many recent messages ride along as context on each turn.
 *
 * Every one of these is re-sent — and re-billed — on every turn, so the window is
 * kept to what a tutoring conversation actually needs to stay coherent. Anything
 * older is folded into the memory summary instead, which is far cheaper to carry.
 */
export const RECENT_MESSAGE_LIMIT = 12;

export async function getConversationContext(env: Env, conversationId: string): Promise<Message[]> {
  return db.getRecentMessages(env, conversationId, RECENT_MESSAGE_LIMIT);
}

export async function maybeSummarize(
  env: Env,
  userId: string,
  conversationId: string,
  callGeminiImpl: typeof callGemini = callGemini
): Promise<void> {
  const total = await db.countMessages(env, conversationId);
  if (total <= RECENT_MESSAGE_LIMIT) return;

  const overflow = total - RECENT_MESSAGE_LIMIT;
  const oldest = await db.getOldestMessages(env, conversationId, overflow);
  if (oldest.length === 0) return;

  const existingSummary = await db.getMemorySummary(env, userId);
  // Model rows store the raw JSON-stringified ModelContent, which for practice
  // tests includes correct_answer/explanation. Route them through
  // modelContentToText (same as chat/routes.ts does for Gemini history) so the
  // summarization prompt never sees the raw answers.
  const transcript = oldest
    .map(
      (m) =>
        `${m.role}: ${m.role === 'model' ? modelContentToText(JSON.parse(m.content) as ModelContent) : m.content}`
    )
    .join('\n');
  const prompt = `Existing summary of this student:\n${existingSummary || '(none yet)'}\n\nNew conversation excerpt to fold in:\n${transcript}\n\nWrite an updated, concise summary (max 200 words) capturing the student's learning style, recurring struggle areas, and topics covered. Return only the summary text.`;

  const result = await callGeminiImpl(
    env.GEMINI_API_KEY,
    'You summarize tutoring conversations concisely and factually.',
    [{ role: 'user', text: prompt }],
    [],
    fetch,
    // Invisible bookkeeping — the cheapest model is the right one here.
    SUMMARY_MODEL
  );

  const newSummary = result.text?.trim() ? result.text : existingSummary;
  await db.setMemorySummary(env, userId, newSummary);
  await db.deleteMessages(env, oldest.map((m) => m.id));
}
