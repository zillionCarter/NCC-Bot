import { Hono } from 'hono';
import type { AppEnv } from '../index';
import type { Role } from '../types';
import * as db from '../db';
import { requireAuth, requireRole } from '../auth/middleware';

const VALID_ROLES: Role[] = ['student', 'teacher', 'admin'];

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.get('/users', requireAuth, requireRole('admin'), async (c) => {
  const users = await db.listUsers(c.env);
  return c.json({ users });
});

adminRoutes.post('/users/:id/role', requireAuth, requireRole('admin'), async (c) => {
  const id = c.req.param('id')!;
  const body = (await c.req.json<{ role?: string }>().catch(() => ({}))) as { role?: string };
  const role = body.role;
  if (!role || !VALID_ROLES.includes(role as Role)) {
    return c.json({ error: 'invalid role' }, 400);
  }
  const target = await db.getUserById(c.env, id);
  if (!target) return c.json({ error: 'user not found' }, 404);
  await db.setUserRole(c.env, id, role as Role);
  return c.json({ ok: true });
});
