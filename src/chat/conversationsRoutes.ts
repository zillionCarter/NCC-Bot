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
