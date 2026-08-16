import { Hono } from 'hono';
import type { AppEnv } from '../index';
import * as db from '../db';
import { isEduAuEmail, generateToken } from './tokens';
import { sendMagicLinkEmail } from './resend';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/request', async (c) => {
  const body = (await c.req.json<{ email?: string }>().catch(() => ({}))) as { email?: string };
  const rawEmail = body && typeof body.email === 'string' ? body.email : null;
  const email = rawEmail?.trim().toLowerCase();
  if (!email || !isEduAuEmail(email)) {
    return c.json({ error: 'Only .edu.au email addresses can sign in.' }, 400);
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await db.createMagicLink(c.env, token, email, expiresAt);

  const link = `${c.env.SITE_URL}/auth/verify?token=${token}`;
  await sendMagicLinkEmail(c.env.RESEND_API_KEY, c.env.EMAIL_FROM, email, link);

  return c.json({ ok: true });
});
