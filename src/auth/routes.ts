import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv } from '../index';
import * as db from '../db';
import { isEduAuEmail, generateToken } from './tokens';
import { sendMagicLinkEmail } from './resend';

export const authRoutes = new Hono<AppEnv>();

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

authRoutes.post('/request', async (c) => {
  const body = (await c.req.json<{ email?: string }>().catch(() => ({}))) as { email?: string };
  const rawEmail = body && typeof body.email === 'string' ? body.email : null;
  const email = rawEmail?.trim().toLowerCase();
  // TEMPORARY, dev-only testing bypass: set ALLOW_ANY_EMAIL_DOMAIN=true in .dev.vars
  // (gitignored, local-only — never set in wrangler.toml [vars] or production secrets)
  // to sign in with any email domain. Remove this bypass before real launch.
  const bypassDomainCheck = c.env.ALLOW_ANY_EMAIL_DOMAIN === 'true';
  if (!email || (!bypassDomainCheck && !isEduAuEmail(email))) {
    return c.json({ error: 'Only .edu.au email addresses can sign in.' }, 400);
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // A D1 write or Resend failure here must not surface as an unhandled
  // exception (Hono's default handler would return a bare, non-JSON 500 with
  // no detail) — log the real cause server-side and return a clean JSON
  // error to the client, matching the pattern already used for the Gemini
  // call in chat/routes.ts.
  try {
    await db.createMagicLink(c.env, token, email, expiresAt);
    const link = `${c.env.SITE_URL}/auth/verify?token=${token}`;
    await sendMagicLinkEmail(c.env.RESEND_API_KEY, c.env.EMAIL_FROM, email, link);
  } catch (err) {
    console.error('Failed to send magic-link email:', err);
    return c.json({ error: 'Could not send the sign-in email right now — please try again in a moment.' }, 502);
  }

  return c.json({ ok: true });
});

authRoutes.get('/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.text('Missing token', 400);

  const result = await db.consumeMagicLink(c.env, token);
  if (!result) return c.text('This link is invalid or has expired.', 400);

  let user = await db.getUserByEmail(c.env, result.email);
  if (!user) {
    // result.email is already lowercased by /auth/request; normalize ADMIN_EMAIL
    // the same way so a secret set with any uppercase characters still matches.
    const role = result.email === c.env.ADMIN_EMAIL.trim().toLowerCase() ? 'admin' : 'student';
    user = await db.createUser(c.env, crypto.randomUUID(), result.email, role);
  }

  const sessionToken = generateToken();
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_SECONDS * 1000).toISOString();
  await db.createSession(c.env, sessionToken, user.id, expiresAt);

  setCookie(c, 'session', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: THIRTY_DAYS_SECONDS,
  });

  return c.redirect('/');
});

authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, 'session');
  if (token) await db.deleteSession(c.env, token);
  deleteCookie(c, 'session', { path: '/' });
  return c.json({ ok: true });
});
