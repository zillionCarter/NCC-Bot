import { Hono } from 'hono';
import type { AppEnv } from '../index';
import * as db from '../db';
import { requireAuth } from '../auth/middleware';

export const onboardingRoutes = new Hono<AppEnv>();

// This text is interpolated into the Gemini system prompt (see buildSystemPrompt),
// ahead of the tutoring policy that governs the model's behavior. Keep it short
// and free of newlines so it can't be used to inject multi-line instructions.
const MAX_FIELD_LENGTH = 80;

function hasEmbeddedNewline(value: string): boolean {
  return /[\r\n]/.test(value);
}

onboardingRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user');
  const body: { name?: string; gradeOrSubject?: string } = await c.req.json().catch(() => ({}));
  const name = body.name?.trim();
  const gradeOrSubject = body.gradeOrSubject?.trim();
  if (!name || !gradeOrSubject) {
    return c.json({ error: 'name and gradeOrSubject are required' }, 400);
  }
  if (name.length > MAX_FIELD_LENGTH || gradeOrSubject.length > MAX_FIELD_LENGTH) {
    return c.json({ error: `name and gradeOrSubject must be ${MAX_FIELD_LENGTH} characters or fewer` }, 400);
  }
  if (hasEmbeddedNewline(name) || hasEmbeddedNewline(gradeOrSubject)) {
    return c.json({ error: 'name and gradeOrSubject cannot contain newlines' }, 400);
  }
  await db.completeOnboarding(c.env, user.id, name, gradeOrSubject);
  return c.json({ ok: true });
});
