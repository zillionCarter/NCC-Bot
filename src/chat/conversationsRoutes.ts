import { Hono } from 'hono';
import type { AppEnv } from '../index';
import * as db from '../db';
import { requireAuth } from '../auth/middleware';

export const conversationsRoutes = new Hono<AppEnv>();

conversationsRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const conversations = await db.listConversations(c.env, user.id);
  return c.json({ conversations });
});
