import { Hono } from 'hono';
import type { AppEnv } from '../index';
import { requireAuth } from '../auth/middleware';

export const meRoutes = new Hono<AppEnv>();

meRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  return c.json({ user });
});
