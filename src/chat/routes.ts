import { Hono } from 'hono';
import type { AppEnv } from '../index';
import type { ModelContent } from '../types';
import * as db from '../db';
import { requireAuth } from '../auth/middleware';
import { callGemini } from '../gemini/client';
import { buildSystemPrompt } from '../gemini/systemPrompt';
import { TOOL_DECLARATIONS, functionCallToContent, modelContentToText, toClientSafeContent } from '../gemini/tools';
import { getConversationContext, maybeSummarize } from '../memory';

export const chatRoutes = new Hono<AppEnv>();

const CHAT_WINDOW_MS = 60 * 1000;
const CHAT_MAX_PER_WINDOW = 15;

chatRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user');

  const allowed = await db.checkAndIncrementRateLimit(c.env, user.id, CHAT_WINDOW_MS, CHAT_MAX_PER_WINDOW);
  if (!allowed) {
    return c.json({ error: 'Too many messages — please wait a moment and try again.' }, 429);
  }

  const body = await c.req
    .json<{ conversationId?: string; message?: string }>()
    .catch(() => ({}) as { conversationId?: string; message?: string });
  const message = body.message?.trim();
  if (!message) return c.json({ error: 'message is required' }, 400);

  let conversationId = body.conversationId;
  if (conversationId) {
    const existing = await db.getConversation(c.env, conversationId, user.id);
    if (!existing) return c.json({ error: 'conversation not found' }, 404);
  } else {
    conversationId = crypto.randomUUID();
    await db.createConversation(c.env, conversationId, user.id, message.slice(0, 60));
  }

  await db.addMessage(c.env, crypto.randomUUID(), conversationId, 'user', message);

  const [history, memorySummary] = await Promise.all([
    getConversationContext(c.env, conversationId),
    db.getMemorySummary(c.env, user.id),
  ]);

  const systemPrompt = buildSystemPrompt({
    role: user.role,
    name: user.name,
    gradeOrSubject: user.grade_or_subject,
    memorySummary,
  });

  const geminiHistory = history.map((m) => ({
    role: m.role,
    text: m.role === 'model' ? modelContentToText(JSON.parse(m.content) as ModelContent) : m.content,
  }));

  // The user's message and rate-limit quota are already persisted above by the
  // time we get here, so a Gemini failure must not throw out of the handler —
  // that would fall through to Hono's default text/plain error handler and
  // break the JSON contract every other route in this codebase honors, leaving
  // the conversation with a dangling user turn and no model reply.
  let result;
  try {
    result = await callGemini(c.env.GEMINI_API_KEY, systemPrompt, geminiHistory, [...TOOL_DECLARATIONS]);
  } catch {
    return c.json({ error: 'The tutor is unavailable right now — please try again in a moment.' }, 502);
  }

  const modelContent: ModelContent = result.functionCall
    ? functionCallToContent(result.functionCall)
    : { type: 'text', text: result.text ?? "Sorry, I couldn't generate a response." };

  const modelMessageId = crypto.randomUUID();
  await db.addMessage(c.env, modelMessageId, conversationId, 'model', JSON.stringify(modelContent));

  // Summarization is best-effort background bookkeeping, not part of this
  // turn's contract: the reply above is already generated and persisted, so
  // a Gemini failure or a malformed stored row here must not turn a
  // successful reply into a 500 for the client.
  try {
    await maybeSummarize(c.env, user.id, conversationId);
  } catch {
    // swallow — the conversation just keeps its full history until the next
    // successful summarization pass folds it.
  }

  return c.json({ conversationId, messageId: modelMessageId, message: toClientSafeContent(modelContent) });
});
