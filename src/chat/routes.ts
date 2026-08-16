import { Hono } from 'hono';
import type { AppEnv } from '../index';
import type { ModelContent } from '../types';
import * as db from '../db';
import { requireAuth } from '../auth/middleware';
import { callGemini } from '../gemini/client';
import { buildSystemPrompt } from '../gemini/systemPrompt';
import { TOOL_DECLARATIONS, functionCallToContent, modelContentToText } from '../gemini/tools';
import { getConversationContext, maybeSummarize } from '../memory';

export const chatRoutes = new Hono<AppEnv>();

// Practice-test correct answers/explanations must never reach the client until
// the student submits their attempt. The full content (with answers) is what
// gets persisted to D1 via db.addMessage — this redaction only applies to the
// HTTP response body.
function toClientSafeContent(content: ModelContent): ModelContent {
  if (content.type !== 'practice_test') return content;
  return {
    type: 'practice_test',
    questions: content.questions.map(({ prompt, choices }) => ({
      prompt,
      choices,
      correct_answer: '',
      explanation: '',
    })),
  };
}

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

  const result = await callGemini(c.env.GEMINI_API_KEY, systemPrompt, geminiHistory, [...TOOL_DECLARATIONS]);

  const modelContent: ModelContent = result.functionCall
    ? functionCallToContent(result.functionCall)
    : { type: 'text', text: result.text ?? "Sorry, I couldn't generate a response." };

  await db.addMessage(c.env, crypto.randomUUID(), conversationId, 'model', JSON.stringify(modelContent));
  await maybeSummarize(c.env, user.id, conversationId);

  return c.json({ conversationId, message: toClientSafeContent(modelContent) });
});
