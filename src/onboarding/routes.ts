import { Hono } from 'hono';
import type { AppEnv } from '../index';
import * as db from '../db';
import { requireAuth } from '../auth/middleware';

export const onboardingRoutes = new Hono<AppEnv>();

onboardingRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user');
  const body: { name?: string; gradeOrSubject?: string } = await c.req.json().catch(() => ({}));
  const name = body.name?.trim();
  const gradeOrSubject = body.gradeOrSubject?.trim();
  if (!name || !gradeOrSubject) {
    return c.json({ error: 'name and gradeOrSubject are required' }, 400);
  }
  await db.completeOnboarding(c.env, user.id, name, gradeOrSubject);
  return c.json({ ok: true });
});
