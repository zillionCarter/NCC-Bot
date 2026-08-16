import { beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import type { Env } from '../src/types';

const testEnv = env as unknown as Env;

beforeAll(async () => {
  // Create users table
  await testEnv.DB.prepare(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'student',
      grade_or_subject TEXT,
      onboarded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `).run();

  // Create magic_links table
  await testEnv.DB.prepare(`
    CREATE TABLE magic_links (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    )
  `).run();

  // Create sessions table
  await testEnv.DB.prepare(`
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL
    )
  `).run();

  // Create conversations table
  await testEnv.DB.prepare(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT,
      created_at TEXT NOT NULL
    )
  `).run();

  // Create messages table
  await testEnv.DB.prepare(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();

  // Create index on messages
  await testEnv.DB.prepare(`
    CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at)
  `).run();

  // Create memory_summaries table
  await testEnv.DB.prepare(`
    CREATE TABLE memory_summaries (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      summary_text TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )
  `).run();
});
