import type { Env, User, Role, Message, Conversation } from './types';

export function nowIso(): string {
  return new Date().toISOString();
}

export async function createUser(env: Env, id: string, email: string, role: Role): Promise<User> {
  const created_at = nowIso();
  await env.DB.prepare(
    'INSERT INTO users (id, email, role, onboarded, created_at) VALUES (?, ?, ?, 0, ?)'
  )
    .bind(id, email, role, created_at)
    .run();
  return { id, email, name: null, role, grade_or_subject: null, onboarded: 0, created_at };
}

export async function getUserByEmail(env: Env, email: string): Promise<User | null> {
  return env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>();
}

export async function getUserById(env: Env, id: string): Promise<User | null> {
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
}

export async function setUserRole(env: Env, userId: string, role: Role): Promise<void> {
  await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, userId).run();
}

export async function listUsers(env: Env): Promise<User[]> {
  const { results } = await env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC').all<User>();
  return results;
}

export async function completeOnboarding(
  env: Env,
  userId: string,
  name: string,
  gradeOrSubject: string
): Promise<void> {
  await env.DB.prepare('UPDATE users SET name = ?, grade_or_subject = ?, onboarded = 1 WHERE id = ?')
    .bind(name, gradeOrSubject, userId)
    .run();
}

export async function createMagicLink(env: Env, token: string, email: string, expiresAt: string): Promise<void> {
  await env.DB.prepare('INSERT INTO magic_links (token, email, expires_at) VALUES (?, ?, ?)')
    .bind(token, email, expiresAt)
    .run();
}

export async function consumeMagicLink(env: Env, token: string): Promise<{ email: string } | null> {
  const nowStr = nowIso();
  const result = await env.DB.prepare(
    'UPDATE magic_links SET used_at = ? WHERE token = ? AND used_at IS NULL AND expires_at > ?'
  )
    .bind(nowStr, token, nowStr)
    .run();
  if (result.meta.changes === 0) return null;
  const row = await env.DB.prepare('SELECT email FROM magic_links WHERE token = ?')
    .bind(token)
    .first<{ email: string }>();
  return row ? { email: row.email } : null;
}

export async function createSession(env: Env, token: string, userId: string, expiresAt: string): Promise<void> {
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, userId, expiresAt)
    .run();
}

export async function getSessionUser(env: Env, token: string): Promise<User | null> {
  const session = await env.DB.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?')
    .bind(token)
    .first<{ user_id: string; expires_at: string }>();
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;
  return getUserById(env, session.user_id);
}

export async function deleteSession(env: Env, token: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export async function createConversation(env: Env, id: string, userId: string, title: string): Promise<void> {
  await env.DB.prepare('INSERT INTO conversations (id, user_id, title, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, userId, title, nowIso())
    .run();
}

export async function getConversation(env: Env, id: string, userId: string) {
  return env.DB.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').bind(id, userId).first();
}

export async function listConversations(env: Env, userId: string): Promise<Conversation[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(userId)
    .all<Conversation>();
  return results;
}

export async function addMessage(
  env: Env,
  id: string,
  conversationId: string,
  role: 'user' | 'model',
  content: string
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(id, conversationId, role, content, nowIso())
    .run();
}

export async function getRecentMessages(env: Env, conversationId: string, limit: number): Promise<Message[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?'
  )
    .bind(conversationId, limit)
    .all<Message>();
  return results.reverse();
}

export async function countMessages(env: Env, conversationId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?')
    .bind(conversationId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function getOldestMessages(env: Env, conversationId: string, count: number): Promise<Message[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?'
  )
    .bind(conversationId, count)
    .all<Message>();
  return results;
}

export async function deleteMessages(env: Env, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await env.DB.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).bind(...ids).run();
}

export async function getMemorySummary(env: Env, userId: string): Promise<string> {
  const row = await env.DB.prepare('SELECT summary_text FROM memory_summaries WHERE user_id = ?')
    .bind(userId)
    .first<{ summary_text: string }>();
  return row?.summary_text ?? '';
}

export async function setMemorySummary(env: Env, userId: string, summary: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO memory_summaries (user_id, summary_text, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET summary_text = excluded.summary_text, updated_at = excluded.updated_at`
  )
    .bind(userId, summary, nowIso())
    .run();
}

export async function checkAndIncrementRateLimit(
  env: Env,
  userId: string,
  windowMs: number,
  maxRequests: number
): Promise<boolean> {
  const now = Date.now();
  const nowStr = new Date(now).toISOString();
  const cutoffStr = new Date(now - windowMs).toISOString();

  // Atomically increment only if the window is still valid and under the limit.
  // The allow/deny decision is embedded in the WHERE clause of the write itself,
  // so concurrent requests can't both pass a separate read-then-decide check.
  const incResult = await env.DB.prepare(
    'UPDATE rate_limits SET count = count + 1 WHERE user_id = ? AND window_start > ? AND count < ?'
  )
    .bind(userId, cutoffStr, maxRequests)
    .run();
  if (incResult.meta.changes > 0) return true;

  // No row existed, or the window had expired — atomically create/reset it.
  // The WHERE guard ensures we only reset a row that's genuinely expired;
  // if it's not (another request already reset it, or count is at max within
  // a valid window), this is a no-op and we fall through to deny.
  const resetResult = await env.DB.prepare(
    `INSERT INTO rate_limits (user_id, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(user_id) DO UPDATE SET window_start = excluded.window_start, count = 1
     WHERE rate_limits.window_start <= ?`
  )
    .bind(userId, nowStr, cutoffStr)
    .run();
  if (resetResult.meta.changes > 0) return true;

  return false;
}
