import type { Env, Message } from './types';
import * as db from './db';
import { callGemini } from './gemini/client';

export const RECENT_MESSAGE_LIMIT = 20;

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
  const transcript = oldest.map((m) => `${m.role}: ${m.content}`).join('\n');
  const prompt = `Existing summary of this student:\n${existingSummary || '(none yet)'}\n\nNew conversation excerpt to fold in:\n${transcript}\n\nWrite an updated, concise summary (max 200 words) capturing the student's learning style, recurring struggle areas, and topics covered. Return only the summary text.`;

  const result = await callGeminiImpl(
    env.GEMINI_API_KEY,
    'You summarize tutoring conversations concisely and factually.',
    [{ role: 'user', text: prompt }],
    []
  );

  await db.setMemorySummary(env, userId, result.text ?? existingSummary);
  await db.deleteMessages(env, oldest.map((m) => m.id));
}
