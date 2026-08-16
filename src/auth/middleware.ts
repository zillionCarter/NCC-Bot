import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../index';
import type { Role } from '../types';
import * as db from '../db';

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const token = getCookie(c, 'session');
  if (!token) return c.json({ error: 'unauthorized' }, 401);
  const user = await db.getSessionUser(c.env, token);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', user);
  await next();
}

export function requireRole(role: Role) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = c.get('user');
    if (!user || user.role !== role) {
      return c.json({ error: 'forbidden' }, 403);
    }
    await next();
  };
}
