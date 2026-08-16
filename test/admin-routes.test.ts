import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import type { Env } from '../src/types';
import * as db from '../src/db';

const testEnv = env as unknown as Env;

async function loginAs(userId: string, email: string, role: 'student' | 'teacher' | 'admin') {
  await db.createUser(testEnv, userId, email, role);
  const future = new Date(Date.now() + 60_000).toISOString();
  await db.createSession(testEnv, `sess-${userId}`, userId, future);
  return { Cookie: `session=sess-${userId}` };
}

describe('admin routes', () => {
  it('a student cannot list users', async () => {
    const headers = await loginAs('admin-u1', 'k@school.edu.au', 'student');
    const res = await SELF.fetch('http://example.com/api/admin/users', { headers });
    expect(res.status).toBe(403);
  });

  it('an admin can list users and promote a student to teacher', async () => {
    const admin = await loginAs('admin-u2', 'l@school.edu.au', 'admin');
    await loginAs('admin-u3', 'm@school.edu.au', 'student');

    const list = await SELF.fetch('http://example.com/api/admin/users', { headers: admin });
    expect(list.status).toBe(200);
    const { users } = await list.json<{ users: { id: string }[] }>();
    expect(users.some((u) => u.id === 'admin-u3')).toBe(true);

    const promote = await SELF.fetch('http://example.com/api/admin/users/admin-u3/role', {
      method: 'POST',
      headers: { ...admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'teacher' }),
    });
    expect(promote.status).toBe(200);

    const updated = await db.getUserById(testEnv, 'admin-u3');
    expect(updated?.role).toBe('teacher');
  });

  it('rejects an invalid role value', async () => {
    const admin = await loginAs('admin-u4', 'n@school.edu.au', 'admin');
    await loginAs('admin-u5', 'o@school.edu.au', 'student');
    const res = await SELF.fetch('http://example.com/api/admin/users/admin-u5/role', {
      method: 'POST',
      headers: { ...admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'superadmin' }),
    });
    expect(res.status).toBe(400);
  });

  it('a student cannot promote users via POST', async () => {
    const student = await loginAs('admin-u6', 'p@school.edu.au', 'student');
    await loginAs('admin-u7', 'q@school.edu.au', 'student');
    const res = await SELF.fetch('http://example.com/api/admin/users/admin-u7/role', {
      method: 'POST',
      headers: { ...student, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'teacher' }),
    });
    expect(res.status).toBe(403);
  });

  it('unauthenticated request gets 401', async () => {
    const res = await SELF.fetch('http://example.com/api/admin/users', {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });
});
