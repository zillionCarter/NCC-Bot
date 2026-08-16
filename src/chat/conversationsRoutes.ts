import { Hono } from 'hono';
import type { AppEnv } from '../index';
import type { ModelContent } from '../types';
import * as db from '../db';
import { requireAuth } from '../auth/middleware';
import { toClientSafeContent } from '../gemini/tools';

export const conversationsRoutes = new Hono<AppEnv>();

conversationsRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const conversations = await db.listConversations(c.env, user.id);
  return c.json({ conversations });
});

conversationsRoutes.get('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id')!;
  const conversation = await db.getConversation(c.env, id, user.id);
  if (!conversation) return c.json({ error: 'conversation not found' }, 404);

  const rows = await db.getAllMessages(c.env, id);
  const messages = rows.map((m) => ({
    id: m.id,
    role: m.role,
    content:
      m.role === 'model'
        ? toClientSafeContent(JSON.parse(m.content) as ModelContent)
        : ({ type: 'text', text: m.content } as ModelContent),
    created_at: m.created_at,
  }));
  return c.json({ messages });
});

conversationsRoutes.post('/:id/messages/:messageId/grade', requireAuth, async (c) => {
  const user = c.get('user');
  const conversationId = c.req.param('id')!;
  const messageId = c.req.param('messageId')!;

  const conversation = await db.getConversation(c.env, conversationId, user.id);
  if (!conversation) return c.json({ error: 'conversation not found' }, 404);

  const message = await db.getMessageById(c.env, messageId);
  if (!message || message.conversation_id !== conversationId || message.role !== 'model') {
    return c.json({ error: 'message not found' }, 404);
  }

  const content = JSON.parse(message.content) as ModelContent;
  if (content.type !== 'practice_test') {
    return c.json({ error: 'message is not a practice test' }, 400);
  }

  const body = await c.req.json<{ answers?: string[] }>().catch(() => ({}) as { answers?: string[] });
  const answers = Array.isArray(body.answers) ? body.answers : [];

  const results = content.questions.map((q, i) => ({
    correct: answers[i] === q.correct_answer,
    correct_answer: q.correct_answer,
    explanation: q.explanation,
  }));

  return c.json({ results });
});
