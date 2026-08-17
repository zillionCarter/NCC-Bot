import { Hono } from 'hono';
import type { Context } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv } from '../index';
import type { User } from '../types';
import * as db from '../db';
import { isEduAuEmail, generateToken, generateCode, normalizeCode } from './tokens';
import { sendMagicLinkEmail } from './resend';

export const authRoutes = new Hono<AppEnv>();

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const LINK_TTL_MS = 15 * 60 * 1000;

function readEmail(body: unknown): string | null {
  const raw = body && typeof (body as { email?: unknown }).email === 'string' ? (body as { email: string }).email : null;
  return raw ? raw.trim().toLowerCase() : null;
}

async function startSession(c: Context<AppEnv>, user: User): Promise<void> {
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
}

async function findOrCreateUser(c: Context<AppEnv>, email: string): Promise<User> {
  const existing = await db.getUserByEmail(c.env, email);
  if (existing) return existing;
  // `email` is already lowercased by the caller; normalize ADMIN_EMAIL the same way
  // so a secret set with any uppercase characters still matches.
  const role = email === c.env.ADMIN_EMAIL.trim().toLowerCase() ? 'admin' : 'student';
  return db.createUser(c.env, crypto.randomUUID(), email, role);
}

authRoutes.post('/request', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = readEmail(body);
  // TEMPORARY, testing-only bypass: set ALLOW_ANY_EMAIL_DOMAIN=true to sign in with
  // any email domain. Remove before real launch — it defeats the signup restriction.
  const bypassDomainCheck = c.env.ALLOW_ANY_EMAIL_DOMAIN === 'true';
  if (!email || (!bypassDomainCheck && !isEduAuEmail(email))) {
    return c.json({ error: 'Only .edu.au email addresses can sign in.' }, 400);
  }

  const token = generateToken();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();

  // A D1 write or Resend failure here must not surface as an unhandled exception
  // (Hono's default handler would return a bare, non-JSON 500 with no detail) — log
  // the real cause server-side and return a clean JSON error to the client.
  try {
    await db.createMagicLink(c.env, token, email, expiresAt, code);
    const link = `${c.env.SITE_URL}/auth/verify?token=${token}`;
    await sendMagicLinkEmail(c.env.RESEND_API_KEY, c.env.EMAIL_FROM, email, link, code);
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

  const user = await findOrCreateUser(c, result.email);
  await startSession(c, user);
  return c.redirect('/');
});

/**
 * The typed-code path, for signing in on a device where opening the mailbox is
 * awkward or impossible. Same 15-minute window as the link, and single-use.
 */
authRoutes.post('/verify-code', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = readEmail(body);
  const rawCode = body && typeof (body as { code?: unknown }).code === 'string' ? (body as { code: string }).code : '';
  const code = normalizeCode(rawCode);

  if (!email || !/^\d{6}$/.test(code)) {
    return c.json({ error: 'Enter the 6-digit code from your email.' }, 400);
  }

  const result = await db.consumeMagicLinkCode(c.env, email, code);
  if (!result) {
    return c.json({ error: 'That code is wrong or has expired. Send a new one to try again.' }, 400);
  }

  const user = await findOrCreateUser(c, result.email);
  await startSession(c, user);
  return c.json({ ok: true });
});

authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, 'session');
  if (token) await db.deleteSession(c.env, token);
  deleteCookie(c, 'session', { path: '/' });
  return c.json({ ok: true });
});
