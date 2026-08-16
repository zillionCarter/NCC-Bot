# NCC Bot Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React/Vite/Tailwind SPA for NCC Bot — login, onboarding, chat with rich-content rendering, theming, and an admin panel — served by the same Cloudflare Worker as the existing API, plus the two backend endpoints (and one backend gap found while designing the practice-test reveal flow) the SPA needs.

**Architecture:** Single Worker, single deploy. `src/frontend/` holds all React source, built by Vite to `dist/`, served via Workers Static Assets with `run_worker_first` on `/api/*` and `/auth/*` so those always hit the existing Hono app. Plain `fetch` wrapper (no data-fetching library), React Context for auth/theme state, `react-router-dom` for real URL routes.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind CSS v4 (via `@tailwindcss/vite`, CSS-custom-property theming), react-router-dom, Recharts, Vitest + `@testing-library/react` (jsdom) for component tests, existing `@cloudflare/vitest-pool-workers` for backend route tests.

**Spec:** [docs/superpowers/specs/2026-08-17-ncc-bot-frontend-design.md](../specs/2026-08-17-ncc-bot-frontend-design.md) (and the backend spec it builds on, [2026-08-16-ncc-bot-design.md](../specs/2026-08-16-ncc-bot-design.md))

## Global Constraints

- Single `package.json` — frontend and Worker deps share one dependency tree (per direction; no separate `frontend/` package).
- Frontend source lives under `src/frontend/`, with its own `tsconfig.frontend.json` (DOM lib, no `@cloudflare/workers-types`) — the root `tsconfig.json` excludes `src/frontend`, since DOM and Workers types both declare conflicting globals (e.g. `Response`).
- No React Query / SWR — a single small `fetch` wrapper in `src/frontend/api/client.ts`, one function per endpoint.
- CSS custom properties (`--color-*`, `--font-*`, defined via Tailwind v4's `@theme` in `src/frontend/styles/theme.css`) drive all theming; components use Tailwind utility classes generated from those tokens (`bg-surface`, `text-ink`, etc.), never hardcoded palette values.
- Any route returning stored `ModelContent` to a client MUST pass it through `toClientSafeContent` (`src/gemini/tools.ts`) — this is a required chokepoint per that file's docstring.
- `react-router-dom` real routes: `/login`, `/onboarding`, `/`, `/c/:conversationId`, `/admin`.
- No dev-only auth backdoor endpoint — the manual end-to-end pass (final verification, below) reads the magic-link token straight out of local D1.
- No fabricated school logo/crest — no source image exists in the repo yet, so the header uses a text wordmark; a real logo file can be dropped in later (see Task 9).

---

## Task 1: `GET /api/me`

**Files:**
- Create: `src/me/routes.ts`
- Modify: `src/index.ts`
- Test: `test/me-routes.test.ts`

**Interfaces:**
- Consumes: `requireAuth` (`src/auth/middleware.ts`), `AppEnv` (`src/index.ts`), `User` type (`src/types.ts`)
- Produces: `meRoutes` (Hono app), mounted at `/api/me`. Response shape: `{ user: User }`.

- [ ] **Step 1: Write the failing test**

```ts
// test/me-routes.test.ts
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

describe('GET /api/me', () => {
  it('401s without a session', async () => {
    const res = await SELF.fetch('http://example.com/api/me');
    expect(res.status).toBe(401);
  });

  it('returns the logged-in user', async () => {
    const headers = await loginAs('me-u1', 'a@school.edu.au', 'student');
    const res = await SELF.fetch('http://example.com/api/me', { headers });
    expect(res.status).toBe(200);
    const body = await res.json<{ user: { id: string; email: string; role: string; onboarded: number } }>();
    expect(body.user.id).toBe('me-u1');
    expect(body.user.email).toBe('a@school.edu.au');
    expect(body.user.role).toBe('student');
    expect(body.user.onboarded).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/me-routes.test.ts`
Expected: FAIL — `/api/me` doesn't exist (404s, not 401/200).

- [ ] **Step 3: Create the route**

```ts
// src/me/routes.ts
import { Hono } from 'hono';
import type { AppEnv } from '../index';
import { requireAuth } from '../auth/middleware';

export const meRoutes = new Hono<AppEnv>();

meRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  return c.json({ user });
});
```

- [ ] **Step 4: Mount it**

```ts
// src/index.ts — add import and route
import { meRoutes } from './me/routes';
// ...
app.route('/api/me', meRoutes);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- test/me-routes.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/me/routes.ts src/index.ts test/me-routes.test.ts
git commit -m "feat: add GET /api/me"
```

---

## Task 2: `GET /api/conversations` (list)

**Files:**
- Modify: `src/types.ts` (add `Conversation`)
- Modify: `src/db.ts` (add `listConversations`)
- Create: `src/chat/conversationsRoutes.ts`
- Modify: `src/index.ts`
- Test: `test/conversations-routes.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `db.createConversation` (existing)
- Produces: `db.listConversations(env: Env, userId: string): Promise<Conversation[]>`; `conversationsRoutes` (Hono app) mounted at `/api/conversations`, `GET /` → `{ conversations: Conversation[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// test/conversations-routes.test.ts
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

describe('GET /api/conversations', () => {
  it('401s without a session', async () => {
    const res = await SELF.fetch('http://example.com/api/conversations');
    expect(res.status).toBe(401);
  });

  it('lists only the caller\'s conversations, most recent first', async () => {
    const headers = await loginAs('conv-u1', 'a@school.edu.au', 'student');
    await loginAs('conv-u2', 'b@school.edu.au', 'student');
    await db.createConversation(testEnv, 'conv-1', 'conv-u1', 'First chat');
    await new Promise((r) => setTimeout(r, 5));
    await db.createConversation(testEnv, 'conv-2', 'conv-u1', 'Second chat');
    await db.createConversation(testEnv, 'conv-other', 'conv-u2', 'Not mine');

    const res = await SELF.fetch('http://example.com/api/conversations', { headers });
    expect(res.status).toBe(200);
    const body = await res.json<{ conversations: { id: string; title: string | null }[] }>();
    expect(body.conversations.map((c) => c.id)).toEqual(['conv-2', 'conv-1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/conversations-routes.test.ts`
Expected: FAIL — `/api/conversations` doesn't exist (404).

- [ ] **Step 3: Add the `Conversation` type**

```ts
// src/types.ts — add near the Message interface
export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
}
```

- [ ] **Step 4: Add `db.listConversations`**

```ts
// src/db.ts — add near createConversation/getConversation
export async function listConversations(env: Env, userId: string): Promise<Conversation[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(userId)
    .all<Conversation>();
  return results;
}
```

Add `Conversation` to the `import type { Env, User, Role, Message } from './types';` line at the top of `src/db.ts`.

- [ ] **Step 5: Create the route**

```ts
// src/chat/conversationsRoutes.ts
import { Hono } from 'hono';
import type { AppEnv } from '../index';
import * as db from '../db';
import { requireAuth } from '../auth/middleware';

export const conversationsRoutes = new Hono<AppEnv>();

conversationsRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const conversations = await db.listConversations(c.env, user.id);
  return c.json({ conversations });
});
```

- [ ] **Step 6: Mount it**

```ts
// src/index.ts
import { conversationsRoutes } from './chat/conversationsRoutes';
// ...
app.route('/api/conversations', conversationsRoutes);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- test/conversations-routes.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/db.ts src/chat/conversationsRoutes.ts src/index.ts test/conversations-routes.test.ts
git commit -m "feat: add GET /api/conversations"
```

---

## Task 3: `GET /api/conversations/:id` (history)

**Files:**
- Modify: `src/db.ts` (add `getAllMessages`)
- Modify: `src/chat/conversationsRoutes.ts`
- Modify: `test/conversations-routes.test.ts`

**Interfaces:**
- Consumes: `db.getConversation` (existing, ownership check), `toClientSafeContent` (`src/gemini/tools.ts`), `ModelContent` (`src/types.ts`)
- Produces: `db.getAllMessages(env: Env, conversationId: string): Promise<Message[]>`; `GET /api/conversations/:id` → `{ messages: { id: string; role: 'user' | 'model'; content: ModelContent; created_at: string }[] }` (404 if not owned).

- [ ] **Step 1: Write the failing test**

```ts
// test/conversations-routes.test.ts — append inside the existing describe block, or a new describe
describe('GET /api/conversations/:id', () => {
  it('404s for a conversation that does not belong to the caller', async () => {
    await loginAs('hist-owner', 'c@school.edu.au', 'student');
    await db.createConversation(testEnv, 'hist-conv', 'hist-owner', 'x');
    const other = await loginAs('hist-other', 'd@school.edu.au', 'student');

    const res = await SELF.fetch('http://example.com/api/conversations/hist-conv', { headers: other });
    expect(res.status).toBe(404);
  });

  it('returns full history with practice-test answers redacted', async () => {
    const headers = await loginAs('hist-u1', 'e@school.edu.au', 'student');
    await db.createConversation(testEnv, 'hist-conv-2', 'hist-u1', 'x');
    await db.addMessage(testEnv, 'msg-1', 'hist-conv-2', 'user', 'give me a practice test');
    await db.addMessage(
      testEnv,
      'msg-2',
      'hist-conv-2',
      'model',
      JSON.stringify({
        type: 'practice_test',
        questions: [{ prompt: 'What is 2+2?', choices: ['3', '4'], correct_answer: '4', explanation: 'because' }],
      })
    );

    const res = await SELF.fetch('http://example.com/api/conversations/hist-conv-2', { headers });
    expect(res.status).toBe(200);
    const body = await res.json<{ messages: { id: string; role: string; content: any }[] }>();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].content).toEqual({ type: 'text', text: 'give me a practice test' });
    expect(body.messages[1].content.type).toBe('practice_test');
    expect(body.messages[1].content.questions[0].correct_answer).toBe('');
    expect(body.messages[1].content.questions[0].explanation).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/conversations-routes.test.ts`
Expected: FAIL — `GET /:id` isn't defined yet (404 for both cases, including the one expecting 200).

- [ ] **Step 3: Add `db.getAllMessages`**

```ts
// src/db.ts — add near getRecentMessages
export async function getAllMessages(env: Env, conversationId: string): Promise<Message[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  )
    .bind(conversationId)
    .all<Message>();
  return results;
}
```

- [ ] **Step 4: Add the route**

```ts
// src/chat/conversationsRoutes.ts — add import and route
import type { ModelContent } from '../types';
import { toClientSafeContent } from '../gemini/tools';

conversationsRoutes.get('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id')!;
  const conversation = await db.getConversation(c.env, id, user.id);
  if (!conversation) return c.json({ error: 'conversation not found' }, 404);

  const rows = await db.getAllMessages(c.env, id);
  const messages = rows.map((m) => ({
    id: m.id,
    role: m.role,
    content:
      m.role === 'model'
        ? toClientSafeContent(JSON.parse(m.content) as ModelContent)
        : ({ type: 'text', text: m.content } as ModelContent),
    created_at: m.created_at,
  }));
  return c.json({ messages });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- test/conversations-routes.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 6: Commit**

```bash
git add src/db.ts src/chat/conversationsRoutes.ts test/conversations-routes.test.ts
git commit -m "feat: add GET /api/conversations/:id"
```

---

## Task 4: Practice-test grading

**Note found while planning:** `toClientSafeContent` strips `correct_answer`/`explanation` before *any* response reaches the client — including the reply from `POST /api/chat` itself, not just history reads. So a freshly-generated practice test can be displayed but never graded unless (a) the client learns the new message's id, and (b) a grading endpoint can re-look-up the *unredacted* stored content server-side. `POST /api/chat`'s handler currently discards the id it generates for the model's message. Both need fixing together.

**Files:**
- Modify: `src/db.ts` (add `getMessageById`)
- Modify: `src/chat/routes.ts` (return the model message's id)
- Modify: `src/chat/conversationsRoutes.ts` (add the grade route)
- Modify: `test/chat-routes.test.ts`
- Modify: `test/conversations-routes.test.ts`

**Interfaces:**
- Consumes: `db.getConversation`, `ModelContent`
- Produces: `db.getMessageById(env: Env, id: string): Promise<Message | null>`; `POST /api/chat` response gains `messageId: string`; `POST /api/conversations/:id/messages/:messageId/grade` → body `{ answers: string[] }` → `{ results: { correct: boolean; correct_answer: string; explanation: string }[] }`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/chat-routes.test.ts — append inside the existing describe('POST /api/chat', ...) block
it('returns the id of the stored model message', async () => {
  const headers = await loginAs('chat-msgid', 'z@school.edu.au', 'student');
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }), { status: 200 })
  );

  const res = await SELF.fetch('http://example.com/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'hello' }),
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

  const body = await res.json<{ conversationId: string; messageId: string }>();
  expect(body.messageId).toBeTruthy();
  const stored = await db.getRecentMessages(env, body.conversationId, 10);
  expect(stored.some((m) => m.id === body.messageId && m.role === 'model')).toBe(true);
});
```

```ts
// test/conversations-routes.test.ts — new describe block
describe('POST /api/conversations/:id/messages/:messageId/grade', () => {
  it('grades answers against the stored (unredacted) practice test', async () => {
    const headers = await loginAs('grade-u1', 'f@school.edu.au', 'student');
    await db.createConversation(testEnv, 'grade-conv', 'grade-u1', 'x');
    await db.addMessage(
      testEnv,
      'grade-msg',
      'grade-conv',
      'model',
      JSON.stringify({
        type: 'practice_test',
        questions: [
          { prompt: 'What is 2+2?', choices: ['3', '4'], correct_answer: '4', explanation: 'Because 2+2=4.' },
          { prompt: 'Capital of France?', choices: ['Paris', 'London'], correct_answer: 'Paris', explanation: 'It just is.' },
        ],
      })
    );

    const res = await SELF.fetch('http://example.com/api/conversations/grade-conv/messages/grade-msg/grade', {
      method: 'POST',
      body: JSON.stringify({ answers: ['4', 'London'] }),
      headers: { ...headers, 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(200);
    const body = await res.json<{ results: { correct: boolean; correct_answer: string; explanation: string }[] }>();
    expect(body.results).toEqual([
      { correct: true, correct_answer: '4', explanation: 'Because 2+2=4.' },
      { correct: false, correct_answer: 'Paris', explanation: 'It just is.' },
    ]);
  });

  it('404s for a conversation the caller does not own', async () => {
    await loginAs('grade-owner', 'g@school.edu.au', 'student');
    await db.createConversation(testEnv, 'grade-conv-2', 'grade-owner', 'x');
    await db.addMessage(
      testEnv,
      'grade-msg-2',
      'grade-conv-2',
      'model',
      JSON.stringify({ type: 'practice_test', questions: [] })
    );
    const other = await loginAs('grade-other', 'h@school.edu.au', 'student');

    const res = await SELF.fetch('http://example.com/api/conversations/grade-conv-2/messages/grade-msg-2/grade', {
      method: 'POST',
      body: JSON.stringify({ answers: [] }),
      headers: { ...other, 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('400s when the message is not a practice test', async () => {
    const headers = await loginAs('grade-u2', 'i@school.edu.au', 'student');
    await db.createConversation(testEnv, 'grade-conv-3', 'grade-u2', 'x');
    await db.addMessage(testEnv, 'grade-msg-3', 'grade-conv-3', 'model', JSON.stringify({ type: 'text', text: 'hi' }));

    const res = await SELF.fetch('http://example.com/api/conversations/grade-conv-3/messages/grade-msg-3/grade', {
      method: 'POST',
      body: JSON.stringify({ answers: [] }),
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/chat-routes.test.ts test/conversations-routes.test.ts`
Expected: FAIL — `messageId` is `undefined` in the chat response; the grade route doesn't exist (404 for all three new cases).

- [ ] **Step 3: Capture and return the model message id in `POST /api/chat`**

```ts
// src/chat/routes.ts — replace the existing addMessage call for the model turn and the final return
const modelMessageId = crypto.randomUUID();
await db.addMessage(c.env, modelMessageId, conversationId, 'model', JSON.stringify(modelContent));

// ...(summarization block unchanged)...

return c.json({ conversationId, messageId: modelMessageId, message: toClientSafeContent(modelContent) });
```

- [ ] **Step 4: Add `db.getMessageById`**

```ts
// src/db.ts — add near addMessage/getRecentMessages
export async function getMessageById(env: Env, id: string): Promise<Message | null> {
  return env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first<Message>();
}
```

- [ ] **Step 5: Add the grade route**

```ts
// src/chat/conversationsRoutes.ts — add route
conversationsRoutes.post('/:id/messages/:messageId/grade', requireAuth, async (c) => {
  const user = c.get('user');
  const conversationId = c.req.param('id')!;
  const messageId = c.req.param('messageId')!;

  const conversation = await db.getConversation(c.env, conversationId, user.id);
  if (!conversation) return c.json({ error: 'conversation not found' }, 404);

  const message = await db.getMessageById(c.env, messageId);
  if (!message || message.conversation_id !== conversationId || message.role !== 'model') {
    return c.json({ error: 'message not found' }, 404);
  }

  const content = JSON.parse(message.content) as ModelContent;
  if (content.type !== 'practice_test') {
    return c.json({ error: 'message is not a practice test' }, 400);
  }

  const body = await c.req.json<{ answers?: string[] }>().catch(() => ({}) as { answers?: string[] });
  const answers = Array.isArray(body.answers) ? body.answers : [];

  const results = content.questions.map((q, i) => ({
    correct: answers[i] === q.correct_answer,
    correct_answer: q.correct_answer,
    explanation: q.explanation,
  }));

  return c.json({ results });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- test/chat-routes.test.ts test/conversations-routes.test.ts`
Expected: PASS

- [ ] **Step 7: Run the full backend suite**

Run: `npm test`
Expected: PASS (full suite green — confirms adding `messageId` to the chat response didn't break the existing `toEqual` check on `body.message`, which is scoped to that sub-object)

- [ ] **Step 8: Commit**

```bash
git add src/db.ts src/chat/routes.ts src/chat/conversationsRoutes.ts test/chat-routes.test.ts test/conversations-routes.test.ts
git commit -m "feat: add practice-test grading endpoint, return message id from POST /api/chat"
```

---

## Task 5: Frontend scaffolding (build pipeline)

**Files:**
- Modify: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.frontend.json`
- Modify: `tsconfig.json`
- Create: `vitest.workspace.ts`
- Create: `vitest.frontend.config.ts`
- Modify: `vitest.config.ts`
- Create: `src/frontend/test-setup.ts`
- Create: `src/frontend/index.html`
- Create: `src/frontend/main.tsx`
- Create: `src/frontend/App.tsx` (placeholder, replaced in Task 9)
- Modify: `src/types.ts` (add `ASSETS` to `Env`)
- Modify: `wrangler.toml`
- Modify: `src/index.ts` (SPA-fallback catch-all)
- Test: `src/frontend/App.test.tsx` (placeholder smoke test, replaced in Task 9)

**Interfaces:**
- Produces: a working `npm run build` (Vite → `dist/`), a working `npm run dev:frontend`, and `npm test` running both the existing Workers-pool suite and a new jsdom frontend suite via the workspace file.

- [ ] **Step 1: Install dependencies**

```bash
npm install react react-dom react-router-dom recharts
npm install -D @vitejs/plugin-react @tailwindcss/vite tailwindcss @testing-library/react @testing-library/jest-dom jsdom @types/react @types/react-dom
```

- [ ] **Step 2: Add the `Env.ASSETS` binding type**

```ts
// src/types.ts — add to the Env interface
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GEMINI_API_KEY: string;
  RESEND_API_KEY: string;
  ADMIN_EMAIL: string;
  EMAIL_FROM: string;
  SITE_URL: string;
}
```

- [ ] **Step 3: Configure the assets binding in `wrangler.toml`**

```toml
# wrangler.toml — add after the [vars] block
[assets]
directory = "./dist"
binding = "ASSETS"
run_worker_first = ["/api/*", "/auth/*"]
```

- [ ] **Step 4: Add the SPA-fallback catch-all route**

```ts
// src/index.ts — add as the LAST route, after /api/onboarding, before `export default app`
app.get('*', async (c) => {
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
  if (assetResponse.status !== 404) return assetResponse;
  const indexUrl = new URL('/index.html', c.req.url);
  return c.env.ASSETS.fetch(new Request(indexUrl, c.req.raw));
});
```

- [ ] **Step 5: Create `tsconfig.frontend.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "noEmit": true
  },
  "include": ["src/frontend", "src/types.ts"]
}
```

- [ ] **Step 6: Exclude `src/frontend` from the root tsconfig**

```json
// tsconfig.json — add an "exclude" key alongside the existing "include"
{
  "compilerOptions": { "...": "unchanged" },
  "include": ["src", "test"],
  "exclude": ["src/frontend"]
}
```

(Keep the existing `compilerOptions` block exactly as-is — only add the `exclude` key.)

- [ ] **Step 7: Create `vite.config.ts`**

```ts
// vite.config.ts (repo root)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'src/frontend',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/auth': 'http://localhost:8787',
    },
  },
});
```

- [ ] **Step 8: Create the placeholder `index.html`, `main.tsx`, `App.tsx`**

```html
<!-- src/frontend/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NCC Bot</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

```tsx
// src/frontend/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

```tsx
// src/frontend/App.tsx — placeholder, replaced in Task 9 with real routing
export default function App() {
  return <div>NCC Bot</div>;
}
```

- [ ] **Step 9: Write the placeholder smoke test**

```tsx
// src/frontend/App.test.tsx — placeholder, replaced in Task 9
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders', () => {
    render(<App />);
    expect(screen.getByText('NCC Bot')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Create the frontend test setup and config**

```ts
// src/frontend/test-setup.ts
import '@testing-library/jest-dom/vitest';
```

```ts
// vitest.frontend.config.ts (repo root)
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'frontend',
    environment: 'jsdom',
    include: ['src/frontend/**/*.test.{ts,tsx}'],
    setupFiles: ['src/frontend/test-setup.ts'],
  },
});
```

- [ ] **Step 11: Scope the existing backend vitest config and add the workspace file**

```ts
// vitest.config.ts — add an explicit `include` so this project doesn't also try to run
// jsdom-only frontend tests under the Workers pool
export default defineConfig({
  test: {
    pool: 'cloudflare',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.worktrees/**'],
  },
  // ...rest unchanged
});
```

```ts
// vitest.workspace.ts (repo root)
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace(['vitest.config.ts', 'vitest.frontend.config.ts']);
```

- [ ] **Step 12: Update `package.json` scripts**

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "dev:frontend": "vite",
    "build": "vite build",
    "test": "vitest run",
    "deploy": "npm run build && wrangler deploy",
    "db:migrate:local": "wrangler d1 migrations apply ncc-bot-db --local",
    "db:migrate:remote": "wrangler d1 migrations apply ncc-bot-db --remote"
  }
}
```

- [ ] **Step 13: Verify the build and test pipelines**

Run: `npm run build`
Expected: succeeds, produces `dist/index.html` and bundled JS.

Run: `npm test`
Expected: PASS — both the existing backend suite and the new one-test frontend suite (via the workspace) run and pass.

- [ ] **Step 14: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.frontend.json tsconfig.json \
  vitest.workspace.ts vitest.frontend.config.ts vitest.config.ts src/frontend/test-setup.ts \
  src/frontend/index.html src/frontend/main.tsx src/frontend/App.tsx src/frontend/App.test.tsx \
  src/types.ts wrangler.toml src/index.ts
git commit -m "feat: scaffold Vite/React frontend build, served via Workers Static Assets"
```

---

## Task 6: Theming

**Files:**
- Create: `src/frontend/styles/theme.css`
- Modify: `src/frontend/index.html` (font links, CSS import)
- Modify: `src/frontend/main.tsx` (CSS import)
- Create: `src/frontend/context/ThemeContext.tsx`
- Create: `src/frontend/components/ThemeSwitcher.tsx`
- Test: `src/frontend/context/ThemeContext.test.tsx`

**Interfaces:**
- Produces: `ThemeProvider` (React component), `useTheme(): { theme: Theme; setTheme: (t: Theme) => void }`, `Theme = 'light' | 'dark' | 'ncc'`, `ThemeSwitcher` (React component, no props).

- [ ] **Step 1: Write the failing test**

```tsx
// src/frontend/context/ThemeContext.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeContext';

function ThemeProbe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setTheme('ncc')}>ncc</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to light and sets data-theme on the root element', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    expect(screen.getByTestId('current-theme').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('updates data-theme and persists the choice when the theme changes', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText('dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('ncc-bot-theme')).toBe('dark');
  });

  it('reads the persisted theme back on a fresh mount', () => {
    localStorage.setItem('ncc-bot-theme', 'ncc');
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    expect(screen.getByTestId('current-theme').textContent).toBe('ncc');
    expect(document.documentElement.getAttribute('data-theme')).toBe('ncc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/frontend/context/ThemeContext.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write the theme CSS**

```css
/* src/frontend/styles/theme.css */
@import 'tailwindcss';

@theme {
  --color-canvas: #ffffff;
  --color-surface: #f5f5f5;
  --color-ink: #1a1a1a;
  --color-ink-muted: #6b6b6b;
  --color-line: #e0e0e0;
  --color-primary: #0057b8;
  --color-primary-ink: #ffffff;
  --color-accent: #feb913;
  --font-heading: system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
}

:root[data-theme='dark'] {
  --color-canvas: #14161a;
  --color-surface: #1e2126;
  --color-ink: #f2f2f2;
  --color-ink-muted: #a0a0a0;
  --color-line: #2c2f36;
  --color-primary: #4c9aff;
  --color-primary-ink: #0b0c0e;
  --color-accent: #feb913;
}

:root[data-theme='ncc'] {
  --color-canvas: #ffffff;
  --color-surface: #fbeceb;
  --color-ink: #434342;
  --color-ink-muted: #726f6e;
  --color-line: #e7d3d3;
  --color-primary: #da2032;
  --color-primary-ink: #ffffff;
  --color-accent: #feb913;
  --font-heading: 'Montserrat', system-ui, sans-serif;
}

body {
  background-color: var(--color-canvas);
  color: var(--color-ink);
  font-family: var(--font-body);
}
```

- [ ] **Step 4: Wire the stylesheet and web fonts**

```html
<!-- src/frontend/index.html — add inside <head>, before </head> -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Montserrat:wght@600;700&display=swap"
  rel="stylesheet"
/>
```

```tsx
// src/frontend/main.tsx — add as the first import
import './styles/theme.css';
```

- [ ] **Step 5: Implement `ThemeContext`**

```tsx
// src/frontend/context/ThemeContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'ncc';

const THEME_STORAGE_KEY = 'ncc-bot-theme';
const THEMES: Theme[] = ['light', 'dark', 'ncc'];

function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as string[]).includes(value);
}

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : 'light';
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/frontend/context/ThemeContext.test.tsx`
Expected: PASS

- [ ] **Step 7: Implement `ThemeSwitcher`** (not directly tested here — exercised visually in Task 9's app shell and the manual E2E pass)

```tsx
// src/frontend/components/ThemeSwitcher.tsx
import { useTheme, type Theme } from '../context/ThemeContext';

const THEME_LABELS: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  ncc: 'NCC',
};

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <select
      aria-label="Theme"
      value={theme}
      onChange={(e) => setTheme(e.target.value as Theme)}
      className="rounded border border-line bg-canvas px-2 py-1 text-sm text-ink"
    >
      {(Object.keys(THEME_LABELS) as Theme[]).map((t) => (
        <option key={t} value={t}>
          {THEME_LABELS[t]}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add src/frontend/styles/theme.css src/frontend/index.html src/frontend/main.tsx \
  src/frontend/context/ThemeContext.tsx src/frontend/context/ThemeContext.test.tsx \
  src/frontend/components/ThemeSwitcher.tsx
git commit -m "feat: add theme system (light/dark/ncc) via CSS custom properties"
```

---

## Task 7: API client

**Files:**
- Create: `src/frontend/api/client.ts`
- Test: `src/frontend/api/client.test.ts`

**Interfaces:**
- Consumes: `ModelContent`, `Role`, `Conversation` (`src/types.ts`)
- Produces: `ApiError` (class, `.status: number`), `ApiUser`, `ClientMessage`, `GradeResult`, `AdminUser` (types), and functions: `requestMagicLink`, `logout`, `getMe`, `submitOnboarding`, `listConversations`, `getConversation`, `sendMessage`, `gradePracticeTest`, `listUsers`, `setUserRole`.

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/api/client.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getMe, sendMessage, ApiError } from './client';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('getMe parses the user on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'u1', email: 'a@b.edu.au', role: 'student' } }), { status: 200 })
    );
    const result = await getMe();
    expect(result.user.id).toBe('u1');
  });

  it('throws ApiError with the server message on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    );
    await expect(getMe()).rejects.toThrow('unauthorized');
    await expect(getMe()).rejects.toBeInstanceOf(ApiError);
  });

  it('sendMessage posts the message and optional conversationId', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversationId: 'c1', messageId: 'm1', message: { type: 'text', text: 'hi' } }), {
        status: 200,
      })
    );
    await sendMessage('hello', 'c1');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ message: 'hello', conversationId: 'c1' }) })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/frontend/api/client.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the client**

```ts
// src/frontend/api/client.ts
import type { Conversation, ModelContent, Role } from '../../types';

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  grade_or_subject: string | null;
  onboarded: number;
}

export interface ClientMessage {
  id: string;
  role: 'user' | 'model';
  content: ModelContent;
  created_at: string;
}

export interface GradeResult {
  correct: boolean;
  correct_answer: string;
  explanation: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  created_at: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `request to ${path} failed with ${res.status}`);
  }
  return (await res.json()) as T;
}

export function requestMagicLink(email: string): Promise<{ ok: true }> {
  return request('/auth/request', { method: 'POST', body: JSON.stringify({ email }) });
}

export function logout(): Promise<{ ok: true }> {
  return request('/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<{ user: ApiUser }> {
  return request('/api/me');
}

export function submitOnboarding(name: string, gradeOrSubject: string): Promise<{ ok: true }> {
  return request('/api/onboarding', { method: 'POST', body: JSON.stringify({ name, gradeOrSubject }) });
}

export function listConversations(): Promise<{ conversations: Conversation[] }> {
  return request('/api/conversations');
}

export function getConversation(id: string): Promise<{ messages: ClientMessage[] }> {
  return request(`/api/conversations/${id}`);
}

export function sendMessage(
  message: string,
  conversationId?: string
): Promise<{ conversationId: string; messageId: string; message: ModelContent }> {
  return request('/api/chat', { method: 'POST', body: JSON.stringify({ message, conversationId }) });
}

export function gradePracticeTest(
  conversationId: string,
  messageId: string,
  answers: string[]
): Promise<{ results: GradeResult[] }> {
  return request(`/api/conversations/${conversationId}/messages/${messageId}/grade`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

export function listUsers(): Promise<{ users: AdminUser[] }> {
  return request('/api/admin/users');
}

export function setUserRole(id: string, role: Role): Promise<{ ok: true }> {
  return request(`/api/admin/users/${id}/role`, { method: 'POST', body: JSON.stringify({ role }) });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/frontend/api/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/frontend/api/client.ts src/frontend/api/client.test.ts
git commit -m "feat: add frontend API client"
```

---

## Task 8: Auth context and route guards

**Files:**
- Create: `src/frontend/context/AuthContext.tsx`
- Create: `src/frontend/routes/Gate.tsx`
- Create: `src/frontend/routes/RequireAdmin.tsx`
- Test: `src/frontend/routes/Gate.test.tsx`
- Test: `src/frontend/routes/RequireAdmin.test.tsx`

**Interfaces:**
- Consumes: `getMe`, `ApiError`, `ApiUser` (Task 7's `api/client.ts`)
- Produces: `AuthProvider` (component), `useAuth(): { user: ApiUser | null; loading: boolean; refresh: () => Promise<void> }`, `Gate` (component, wraps routed content), `RequireAdmin` (component, wraps admin-only content).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/frontend/routes/Gate.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { Gate } from './Gate';
import * as api from '../api/client';

afterEach(() => vi.restoreAllMocks());

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Gate>
          <Routes>
            <Route path="/login" element={<div>login screen</div>} />
            <Route path="/onboarding" element={<div>onboarding screen</div>} />
            <Route path="/" element={<div>chat screen</div>} />
          </Routes>
        </Gate>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Gate', () => {
  it('redirects to /login when /api/me is unauthorized', async () => {
    vi.spyOn(api, 'getMe').mockRejectedValue(new api.ApiError(401, 'unauthorized'));
    renderAt('/');
    await waitFor(() => expect(screen.getByText('login screen')).toBeInTheDocument());
  });

  it('redirects to /onboarding when the user has not onboarded', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({
      user: { id: 'u1', email: 'a@b.edu.au', name: null, role: 'student', grade_or_subject: null, onboarded: 0 },
    });
    renderAt('/');
    await waitFor(() => expect(screen.getByText('onboarding screen')).toBeInTheDocument());
  });

  it('renders the requested route once logged in and onboarded', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({
      user: { id: 'u1', email: 'a@b.edu.au', name: 'Sam', role: 'student', grade_or_subject: 'Year 9', onboarded: 1 },
    });
    renderAt('/');
    await waitFor(() => expect(screen.getByText('chat screen')).toBeInTheDocument());
  });
});
```

```tsx
// src/frontend/routes/RequireAdmin.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAdmin } from './RequireAdmin';
import { AuthProvider } from '../context/AuthContext';
import * as api from '../api/client';

afterEach(() => vi.restoreAllMocks());

describe('RequireAdmin', () => {
  it('redirects non-admins to /', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({
      user: { id: 'u1', email: 'a@b.edu.au', name: 'Sam', role: 'student', grade_or_subject: 'Year 9', onboarded: 1 },
    });
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<div>chat screen</div>} />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <div>admin screen</div>
                </RequireAdmin>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText('chat screen')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/frontend/routes/Gate.test.tsx src/frontend/routes/RequireAdmin.test.tsx`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement `AuthContext`**

```tsx
// src/frontend/context/AuthContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getMe, type ApiUser } from '../api/client';

interface AuthContextValue {
  user: ApiUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const { user } = await getMe();
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return <AuthContext.Provider value={{ user, loading, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Implement `Gate`**

```tsx
// src/frontend/routes/Gate.tsx
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Gate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-ink-muted">Loading…</div>;
  }

  if (!user) {
    return location.pathname === '/login' ? <>{children}</> : <Navigate to="/login" replace />;
  }

  if (!user.onboarded) {
    return location.pathname === '/onboarding' ? <>{children}</> : <Navigate to="/onboarding" replace />;
  }

  if (location.pathname === '/login' || location.pathname === '/onboarding') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 5: Implement `RequireAdmin`**

```tsx
// src/frontend/routes/RequireAdmin.tsx
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/frontend/routes/Gate.test.tsx src/frontend/routes/RequireAdmin.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/frontend/context/AuthContext.tsx src/frontend/routes/Gate.tsx src/frontend/routes/RequireAdmin.tsx \
  src/frontend/routes/Gate.test.tsx src/frontend/routes/RequireAdmin.test.tsx
git commit -m "feat: add auth context and route guards"
```

---

## Task 9: App shell (routing, layout, header)

**Files:**
- Modify: `src/frontend/App.tsx` (replaces Task 5's placeholder)
- Modify: `src/frontend/App.test.tsx` (replaces Task 5's placeholder)
- Modify: `src/frontend/main.tsx` (wrap in `BrowserRouter`)
- Create: `src/frontend/components/Layout.tsx`
- Create: `src/frontend/routes/Login.tsx` (stub — full implementation in Task 10)
- Create: `src/frontend/routes/Onboarding.tsx` (stub — full implementation in Task 11)
- Create: `src/frontend/routes/Chat.tsx` (stub — full implementation in Task 12)
- Create: `src/frontend/routes/Admin.tsx` (stub — full implementation in Task 16)

**Interfaces:**
- Consumes: `AuthProvider`, `useAuth` (Task 8); `ThemeProvider`, `ThemeSwitcher` (Task 6); `Gate`, `RequireAdmin` (Task 8); `logout` (Task 7)
- Produces: wired `App` default export with real routes; `Layout` (component, `{ children: ReactNode }`).

**Note on the logo:** per the Global Constraints, there's no source logo image in the repo yet, so `Layout`'s header uses a plain text wordmark ("NCC Bot"). If a real shield image is added later at e.g. `src/frontend/assets/logo.png` / `logo-dark.png`, swap the `<Link>` text below for an `<img>` — that's a follow-up, not part of this plan.

- [ ] **Step 1: Write the stub route components**

```tsx
// src/frontend/routes/Login.tsx — stub, full version in Task 10
export function Login() {
  return <div>login screen</div>;
}
```

```tsx
// src/frontend/routes/Onboarding.tsx — stub, full version in Task 11
export function Onboarding() {
  return <div>onboarding screen</div>;
}
```

```tsx
// src/frontend/routes/Chat.tsx — stub, full version in Task 12
export function Chat() {
  return <div>chat screen</div>;
}
```

```tsx
// src/frontend/routes/Admin.tsx — stub, full version in Task 16
export function Admin() {
  return <div>admin screen</div>;
}
```

- [ ] **Step 2: Implement `Layout`**

```tsx
// src/frontend/components/Layout.tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ThemeSwitcher } from './ThemeSwitcher';
import { logout } from '../api/client';

export function Layout({ children }: { children: ReactNode }) {
  const { user, refresh } = useAuth();

  async function handleLogout() {
    await logout();
    await refresh();
  }

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-2">
        <Link to="/" className="font-heading text-lg font-semibold text-primary">
          NCC Bot
        </Link>
        <div className="flex items-center gap-3">
          {user?.role === 'admin' && (
            <Link to="/admin" className="text-sm text-ink-muted hover:text-ink">
              Admin
            </Link>
          )}
          <ThemeSwitcher />
          <button onClick={handleLogout} className="text-sm text-ink-muted hover:text-ink">
            Log out
          </button>
        </div>
      </header>
      <main className="flex flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Wire `App.tsx`**

```tsx
// src/frontend/App.tsx
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Gate } from './routes/Gate';
import { RequireAdmin } from './routes/RequireAdmin';
import { Layout } from './components/Layout';
import { Login } from './routes/Login';
import { Onboarding } from './routes/Onboarding';
import { Chat } from './routes/Chat';
import { Admin } from './routes/Admin';

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Gate>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route
              path="/"
              element={
                <Layout>
                  <Chat />
                </Layout>
              }
            />
            <Route
              path="/c/:conversationId"
              element={
                <Layout>
                  <Chat />
                </Layout>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <Layout>
                    <Admin />
                  </Layout>
                </RequireAdmin>
              }
            />
          </Routes>
        </Gate>
      </ThemeProvider>
    </AuthProvider>
  );
}
```

- [ ] **Step 4: Wrap the app in `BrowserRouter`**

```tsx
// src/frontend/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/theme.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

- [ ] **Step 5: Replace the placeholder `App.test.tsx`**

```tsx
// src/frontend/App.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import * as api from './api/client';

afterEach(() => vi.restoreAllMocks());

describe('App', () => {
  it('shows the login screen when logged out', async () => {
    vi.spyOn(api, 'getMe').mockRejectedValue(new api.ApiError(401, 'unauthorized'));
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('login screen')).toBeInTheDocument());
  });

  it('shows the chat screen inside the layout when logged in and onboarded', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({
      user: { id: 'u1', email: 'a@b.edu.au', name: 'Sam', role: 'student', grade_or_subject: 'Year 9', onboarded: 1 },
    });
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('chat screen')).toBeInTheDocument());
    expect(screen.getByText('NCC Bot')).toBeInTheDocument();
    expect(screen.getByLabelText('Theme')).toBeInTheDocument();
  });
});
```

Note: `MemoryRouter` is used here instead of `BrowserRouter` (which `main.tsx` uses for the real app) because `App` itself doesn't render a router — tests need control over the initial route.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/frontend/App.test.tsx`
Expected: PASS

- [ ] **Step 7: Verify the build still succeeds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/frontend/App.tsx src/frontend/App.test.tsx src/frontend/main.tsx src/frontend/components/Layout.tsx \
  src/frontend/routes/Login.tsx src/frontend/routes/Onboarding.tsx src/frontend/routes/Chat.tsx src/frontend/routes/Admin.tsx
git commit -m "feat: wire app shell with routing, layout, and auth/theme gating"
```

---

## Task 10: Login screen

**Files:**
- Modify: `src/frontend/routes/Login.tsx`
- Test: `src/frontend/routes/Login.test.tsx`

**Interfaces:**
- Consumes: `requestMagicLink`, `ApiError` (Task 7)

- [ ] **Step 1: Write the failing test**

```tsx
// src/frontend/routes/Login.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Login } from './Login';
import * as api from '../api/client';

afterEach(() => vi.restoreAllMocks());

describe('Login', () => {
  it('shows a confirmation after successfully requesting a magic link', async () => {
    vi.spyOn(api, 'requestMagicLink').mockResolvedValue({ ok: true });
    render(<Login />);

    fireEvent.change(screen.getByPlaceholderText(/yourschool/), { target: { value: 's@school.edu.au' } });
    fireEvent.click(screen.getByRole('button', { name: /send sign-in link/i }));

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
    expect(api.requestMagicLink).toHaveBeenCalledWith('s@school.edu.au');
  });

  it('shows an error message when the request fails', async () => {
    vi.spyOn(api, 'requestMagicLink').mockRejectedValue(
      new api.ApiError(400, 'Only .edu.au email addresses can sign in.')
    );
    render(<Login />);

    fireEvent.change(screen.getByPlaceholderText(/yourschool/), { target: { value: 'x@gmail.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send sign-in link/i }));

    await waitFor(() => expect(screen.getByText(/only \.edu\.au/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/frontend/routes/Login.test.tsx`
Expected: FAIL — the stub renders `<div>login screen</div>` with no form.

- [ ] **Step 3: Implement `Login`**

```tsx
// src/frontend/routes/Login.tsx
import { useState, type FormEvent } from 'react';
import { requestMagicLink, ApiError } from '../api/client';

export function Login() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      await requestMagicLink(email.trim());
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  if (status === 'sent') {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas text-ink">
        <div className="max-w-sm text-center">
          <h1 className="font-heading text-xl font-semibold">Check your email</h1>
          <p className="mt-2 text-ink-muted">
            We sent a sign-in link to {email}. Click it to continue — this tab can stay open.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-canvas text-ink">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3 rounded border border-line bg-surface p-6">
        <h1 className="font-heading text-xl font-semibold">Sign in to NCC Bot</h1>
        <p className="text-sm text-ink-muted">Use your school email address (must end in .edu.au).</p>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourschool.edu.au"
          className="w-full rounded border border-line bg-canvas px-3 py-2 text-ink"
        />
        {status === 'error' && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={status === 'sending'}
          className="w-full rounded bg-primary px-3 py-2 text-primary-ink disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/frontend/routes/Login.test.tsx`
Expected: PASS

- [ ] **Step 5: Run `App.test.tsx` to confirm it still passes**

Run: `npm test -- src/frontend/App.test.tsx`
Expected: PASS (App's "logged out" test now renders the real Login form instead of the old stub text — it only asserted on `getMe` being called and the eventual route, so check it doesn't assert on the literal `'login screen'` text; if it does, update that assertion to `screen.getByRole('heading', { name: /sign in to ncc bot/i })` instead)

- [ ] **Step 6: Commit**

```bash
git add src/frontend/routes/Login.tsx src/frontend/routes/Login.test.tsx src/frontend/App.test.tsx
git commit -m "feat: implement login screen"
```

---

## Task 11: Onboarding screen

**Files:**
- Modify: `src/frontend/routes/Onboarding.tsx`
- Test: `src/frontend/routes/Onboarding.test.tsx`

**Interfaces:**
- Consumes: `submitOnboarding`, `ApiError` (Task 7); `useAuth` (Task 8)

- [ ] **Step 1: Write the failing test**

```tsx
// src/frontend/routes/Onboarding.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Onboarding } from './Onboarding';
import * as api from '../api/client';
import { AuthProvider } from '../context/AuthContext';

afterEach(() => vi.restoreAllMocks());

describe('Onboarding', () => {
  it("walks through intro -> name -> gradeOrSubject and submits both fields", async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({
      user: { id: 'u1', email: 'a@b.edu.au', name: null, role: 'student', grade_or_subject: null, onboarded: 0 },
    });
    const submitSpy = vi.spyOn(api, 'submitOnboarding').mockResolvedValue({ ok: true });

    render(
      <MemoryRouter>
        <AuthProvider>
          <Onboarding />
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /let's go/i }));

    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.change(screen.getByPlaceholderText(/year 10/i), { target: { value: 'Year 9' } });
    fireEvent.click(screen.getByRole('button', { name: /finish/i }));

    await waitFor(() => expect(submitSpy).toHaveBeenCalledWith('Sam', 'Year 9'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/frontend/routes/Onboarding.test.tsx`
Expected: FAIL — the stub has no interactive elements.

- [ ] **Step 3: Implement `Onboarding`**

```tsx
// src/frontend/routes/Onboarding.tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitOnboarding, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';

type Step = 'intro' | 'name' | 'gradeOrSubject' | 'submitting';

const INTRO_MESSAGE =
  "Hi, I'm NCC Bot! I'm here to help you learn — I'll usually guide you to answers rather than just giving them to you, and like any AI I can get things wrong, so always think critically about what I say. Let's get you set up.";

export function Onboarding() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('intro');
  const [name, setName] = useState('');
  const [gradeOrSubject, setGradeOrSubject] = useState('');
  const [error, setError] = useState('');

  async function handleFinalSubmit(finalGradeOrSubject: string) {
    setStep('submitting');
    setError('');
    try {
      await submitOnboarding(name.trim(), finalGradeOrSubject.trim());
      await refresh();
      navigate('/');
    } catch (err) {
      setStep('gradeOrSubject');
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-canvas p-6 text-ink">
      <div className="w-full max-w-md space-y-4">
        <div className="rounded rounded-bl-none bg-surface p-4">{INTRO_MESSAGE}</div>

        {step === 'intro' && (
          <button onClick={() => setStep('name')} className="rounded bg-primary px-3 py-2 text-primary-ink">
            Let's go
          </button>
        )}

        {(step === 'name' || step === 'gradeOrSubject' || step === 'submitting') && (
          <div className="rounded rounded-bl-none bg-surface p-4">What should I call you?</div>
        )}

        {step === 'name' && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (name.trim()) setStep('gradeOrSubject');
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="flex-1 rounded border border-line bg-canvas px-3 py-2 text-ink"
            />
            <button type="submit" className="rounded bg-primary px-3 py-2 text-primary-ink">
              Next
            </button>
          </form>
        )}

        {(step === 'gradeOrSubject' || step === 'submitting') && (
          <>
            <div className="rounded rounded-bl-none bg-surface p-4">
              And what grade are you in? (Teachers/admins: what subject do you teach?)
            </div>
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (gradeOrSubject.trim()) handleFinalSubmit(gradeOrSubject);
              }}
              className="flex gap-2"
            >
              <input
                autoFocus
                value={gradeOrSubject}
                onChange={(e) => setGradeOrSubject(e.target.value)}
                placeholder="e.g. Year 10, or Mathematics"
                disabled={step === 'submitting'}
                className="flex-1 rounded border border-line bg-canvas px-3 py-2 text-ink"
              />
              <button
                type="submit"
                disabled={step === 'submitting'}
                className="rounded bg-primary px-3 py-2 text-primary-ink disabled:opacity-50"
              >
                {step === 'submitting' ? 'Saving…' : 'Finish'}
              </button>
            </form>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/frontend/routes/Onboarding.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/frontend/routes/Onboarding.tsx src/frontend/routes/Onboarding.test.tsx
git commit -m "feat: implement scripted onboarding screen"
```

---

## Task 12: Chat screen (text messages only)

**Files:**
- Create: `src/frontend/components/Sidebar.tsx`
- Create: `src/frontend/components/MessageThread.tsx` (text-only for now; rich-content branches added in Tasks 13-15)
- Create: `src/frontend/components/MessageInput.tsx`
- Modify: `src/frontend/routes/Chat.tsx`
- Test: `src/frontend/routes/Chat.test.tsx`

**Interfaces:**
- Consumes: `listConversations`, `getConversation`, `sendMessage`, `ClientMessage` (Task 7)
- Produces: `Sidebar({ refreshKey: number })`, `MessageThread({ messages: ClientMessage[]; conversationId: string | null })`, `MessageInput({ onSend: (message: string) => void; disabled: boolean })` — all consumed directly by later tasks (13-15 extend `MessageThread`'s render branches; they don't change its props).

- [ ] **Step 1: Write the failing test**

```tsx
// src/frontend/routes/Chat.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Chat } from './Chat';
import * as api from '../api/client';

afterEach(() => vi.restoreAllMocks());

describe('Chat', () => {
  it('sends a message and renders the reply', async () => {
    vi.spyOn(api, 'listConversations').mockResolvedValue({ conversations: [] });
    vi.spyOn(api, 'sendMessage').mockResolvedValue({
      conversationId: 'c1',
      messageId: 'm1',
      message: { type: 'text', text: 'An API is a way for programs to talk to each other.' },
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/c/:conversationId" element={<Chat />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/ask ncc bot/i), { target: { value: 'what is an api' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(screen.getByText('what is an api')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('An API is a way for programs to talk to each other.')).toBeInTheDocument()
    );
    expect(api.sendMessage).toHaveBeenCalledWith('what is an api', undefined);
  });

  it('loads history for an existing conversation from the URL', async () => {
    vi.spyOn(api, 'listConversations').mockResolvedValue({ conversations: [] });
    vi.spyOn(api, 'getConversation').mockResolvedValue({
      messages: [
        { id: 'h1', role: 'user', content: { type: 'text', text: 'earlier question' }, created_at: '2026-01-01' },
        { id: 'h2', role: 'model', content: { type: 'text', text: 'earlier answer' }, created_at: '2026-01-01' },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/c/existing-convo']}>
        <Routes>
          <Route path="/c/:conversationId" element={<Chat />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('earlier question')).toBeInTheDocument());
    expect(screen.getByText('earlier answer')).toBeInTheDocument();
    expect(api.getConversation).toHaveBeenCalledWith('existing-convo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/frontend/routes/Chat.test.tsx`
Expected: FAIL — the stub has no input/thread.

- [ ] **Step 3: Implement `Sidebar`**

```tsx
// src/frontend/components/Sidebar.tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { listConversations } from '../api/client';
import type { Conversation } from '../../types';

export function Sidebar({ refreshKey }: { refreshKey: number }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const { conversationId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    listConversations()
      .then(({ conversations }) => setConversations(conversations))
      .catch(() => setConversations([]));
  }, [refreshKey]);

  return (
    <aside className="flex w-64 flex-col border-r border-line bg-surface">
      <button
        onClick={() => navigate('/')}
        className="m-2 rounded border border-line px-3 py-2 text-left text-sm hover:bg-canvas"
      >
        + New chat
      </button>
      <nav className="flex-1 overflow-y-auto">
        {conversations.map((c) => (
          <Link
            key={c.id}
            to={`/c/${c.id}`}
            className={`block truncate px-3 py-2 text-sm hover:bg-canvas ${
              c.id === conversationId ? 'bg-canvas font-medium' : ''
            }`}
          >
            {c.title || 'Untitled chat'}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 4: Implement `MessageThread`** (text-only branch; other `content.type` branches added in Tasks 13-15)

```tsx
// src/frontend/components/MessageThread.tsx
import type { ClientMessage } from '../api/client';

export function MessageThread({
  messages,
  conversationId,
}: {
  messages: ClientMessage[];
  conversationId: string | null;
}) {
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-2xl rounded p-3 ${
              m.role === 'user' ? 'bg-primary text-primary-ink' : 'bg-surface text-ink'
            }`}
          >
            {m.content.type === 'text' && <p className="whitespace-pre-wrap">{m.content.text}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
```

(`conversationId` is accepted now, unused until Task 14 wires it into `PracticeTest`, which needs it to call the grade endpoint.)

- [ ] **Step 5: Implement `MessageInput`**

```tsx
// src/frontend/components/MessageInput.tsx
import { useState, type FormEvent, type KeyboardEvent } from 'react';

export function MessageInput({ onSend, disabled }: { onSend: (message: string) => void; disabled: boolean }) {
  const [value, setValue] = useState('');

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-line bg-surface p-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask NCC Bot anything…"
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none rounded border border-line bg-canvas px-3 py-2 text-ink disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded bg-primary px-4 py-2 text-primary-ink disabled:opacity-50"
      >
        Send
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Wire the `Chat` route**

```tsx
// src/frontend/routes/Chat.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getConversation, sendMessage, type ClientMessage } from '../api/client';
import { Sidebar } from '../components/Sidebar';
import { MessageThread } from '../components/MessageThread';
import { MessageInput } from '../components/MessageInput';

export function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    getConversation(conversationId)
      .then(({ messages }) => setMessages(messages))
      .catch(() => setMessages([]));
  }, [conversationId]);

  async function handleSend(message: string) {
    const optimisticId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        role: 'user',
        content: { type: 'text', text: message },
        created_at: new Date().toISOString(),
      },
    ]);
    setSending(true);
    try {
      const result = await sendMessage(message, conversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: result.messageId,
          role: 'model',
          content: result.message,
          created_at: new Date().toISOString(),
        },
      ]);
      setSidebarRefreshKey((k) => k + 1);
      if (!conversationId) navigate(`/c/${result.conversationId}`, { replace: true });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Sidebar refreshKey={sidebarRefreshKey} />
      <div className="flex flex-1 flex-col">
        <MessageThread messages={messages} conversationId={conversationId ?? null} />
        <MessageInput onSend={handleSend} disabled={sending} />
      </div>
    </>
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- src/frontend/routes/Chat.test.tsx`
Expected: PASS

- [ ] **Step 8: Run `App.test.tsx` to confirm it still passes**

Run: `npm test -- src/frontend/App.test.tsx`
Expected: PASS (App's "logged in" test asserted on the literal `'chat screen'` stub text — update that assertion to something the real `Chat` component renders, e.g. `screen.getByPlaceholderText(/ask ncc bot/i)`)

- [ ] **Step 9: Commit**

```bash
git add src/frontend/components/Sidebar.tsx src/frontend/components/MessageThread.tsx \
  src/frontend/components/MessageInput.tsx src/frontend/routes/Chat.tsx src/frontend/routes/Chat.test.tsx \
  src/frontend/App.test.tsx
git commit -m "feat: implement chat screen (sidebar, thread, input) for text messages"
```

---

## Task 13: Flashcards

**Files:**
- Create: `src/frontend/components/Flashcards.tsx`
- Modify: `src/frontend/components/MessageThread.tsx`
- Test: `src/frontend/components/Flashcards.test.tsx`

**Interfaces:**
- Produces: `Flashcards({ cards: { front: string; back: string }[] })`

- [ ] **Step 1: Write the failing test**

```tsx
// src/frontend/components/Flashcards.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Flashcards } from './Flashcards';

const cards = [
  { front: 'What is H2O?', back: 'Water' },
  { front: 'What is NaCl?', back: 'Salt' },
];

describe('Flashcards', () => {
  it('shows the front by default and flips to the back on click', () => {
    render(<Flashcards cards={cards} />);
    expect(screen.getByText('What is H2O?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('What is H2O?'));
    expect(screen.getByText('Water')).toBeInTheDocument();
  });

  it('advances to the next card and resets the flip state', () => {
    render(<Flashcards cards={cards} />);
    fireEvent.click(screen.getByText('What is H2O?'));
    fireEvent.click(screen.getByText('Next →'));
    expect(screen.getByText('What is NaCl?')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/frontend/components/Flashcards.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `Flashcards`**

```tsx
// src/frontend/components/Flashcards.tsx
import { useState } from 'react';

interface Card {
  front: string;
  back: string;
}

export function Flashcards({ cards }: { cards: Card[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (cards.length === 0) return null;
  const card = cards[index];

  function go(delta: number) {
    setFlipped(false);
    setIndex((i) => Math.max(0, Math.min(cards.length - 1, i + delta)));
  }

  return (
    <div className="w-72">
      <button
        onClick={() => setFlipped((f) => !f)}
        className="flex h-40 w-full items-center justify-center rounded border border-line bg-canvas p-4 text-center"
      >
        {flipped ? card.back : card.front}
      </button>
      <div className="mt-2 flex items-center justify-between text-sm text-ink-muted">
        <button onClick={() => go(-1)} disabled={index === 0} className="disabled:opacity-30">
          ← Prev
        </button>
        <span>
          {index + 1} / {cards.length}
        </span>
        <button onClick={() => go(1)} disabled={index === cards.length - 1} className="disabled:opacity-30">
          Next →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire it into `MessageThread`**

```tsx
// src/frontend/components/MessageThread.tsx — add import and render branch
import { Flashcards } from './Flashcards';
// ...inside the message bubble, alongside the existing text branch:
{m.content.type === 'flashcards' && <Flashcards cards={m.content.cards} />}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/frontend/components/Flashcards.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/frontend/components/Flashcards.tsx src/frontend/components/Flashcards.test.tsx \
  src/frontend/components/MessageThread.tsx
git commit -m "feat: add flippable flashcard deck component"
```

---

## Task 14: Practice test (submit-then-reveal)

**Files:**
- Create: `src/frontend/components/PracticeTest.tsx`
- Modify: `src/frontend/components/MessageThread.tsx`
- Test: `src/frontend/components/PracticeTest.test.tsx`

**Interfaces:**
- Consumes: `gradePracticeTest`, `GradeResult` (Task 7)
- Produces: `PracticeTest({ conversationId: string; messageId: string; questions: { prompt: string; choices?: string[]; correct_answer: string; explanation: string }[] })`

This is the "trickiest logic" case called out in the spec — the reveal must only happen after the grade response returns, never before.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/frontend/components/PracticeTest.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PracticeTest } from './PracticeTest';
import * as api from '../api/client';

afterEach(() => vi.restoreAllMocks());

const questions = [{ prompt: 'What is 2 + 2?', choices: ['3', '4', '5'], correct_answer: '', explanation: '' }];

describe('PracticeTest', () => {
  it('disables Submit until every question is answered', () => {
    render(<PracticeTest conversationId="c1" messageId="m1" questions={questions} />);
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('4'));
    expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled();
  });

  it('does not show correctness or explanation before submitting', () => {
    render(<PracticeTest conversationId="c1" messageId="m1" questions={questions} />);
    fireEvent.click(screen.getByLabelText('4'));
    expect(screen.queryByText(/because 2 \+ 2/i)).not.toBeInTheDocument();
  });

  it('reveals correctness and explanation only after the grade response returns', async () => {
    vi.spyOn(api, 'gradePracticeTest').mockResolvedValue({
      results: [{ correct: true, correct_answer: '4', explanation: 'Because 2 + 2 = 4.' }],
    });
    render(<PracticeTest conversationId="c1" messageId="m1" questions={questions} />);

    fireEvent.click(screen.getByLabelText('4'));
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(screen.queryByText(/because 2 \+ 2/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/because 2 \+ 2/i)).toBeInTheDocument());
    expect(api.gradePracticeTest).toHaveBeenCalledWith('c1', 'm1', ['4']);
  });

  it('locks the answer inputs after grading', async () => {
    vi.spyOn(api, 'gradePracticeTest').mockResolvedValue({
      results: [{ correct: false, correct_answer: '4', explanation: 'Because 2 + 2 = 4.' }],
    });
    render(<PracticeTest conversationId="c1" messageId="m1" questions={questions} />);

    fireEvent.click(screen.getByLabelText('3'));
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(screen.getByLabelText('3')).toBeDisabled());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/frontend/components/PracticeTest.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `PracticeTest`**

```tsx
// src/frontend/components/PracticeTest.tsx
import { useState } from 'react';
import { gradePracticeTest, type GradeResult } from '../api/client';

interface Question {
  prompt: string;
  choices?: string[];
  correct_answer: string;
  explanation: string;
}

export function PracticeTest({
  conversationId,
  messageId,
  questions,
}: {
  conversationId: string;
  messageId: string;
  questions: Question[];
}) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));
  const [results, setResults] = useState<GradeResult[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const allAnswered = answers.every((a) => a.trim() !== '');

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const { results } = await gradePracticeTest(conversationId, messageId, answers);
      setResults(results);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-xl space-y-4">
      {questions.map((q, i) => (
        <div key={i} className="rounded border border-line bg-canvas p-3">
          <p className="font-medium">{q.prompt}</p>
          {q.choices ? (
            <div className="mt-2 space-y-1">
              {q.choices.map((choice) => (
                <label key={choice} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`q-${messageId}-${i}`}
                    aria-label={choice}
                    value={choice}
                    checked={answers[i] === choice}
                    disabled={results !== null}
                    onChange={() => setAnswers((prev) => prev.map((a, idx) => (idx === i ? choice : a)))}
                  />
                  {choice}
                </label>
              ))}
            </div>
          ) : (
            <input
              value={answers[i]}
              disabled={results !== null}
              onChange={(e) => setAnswers((prev) => prev.map((a, idx) => (idx === i ? e.target.value : a)))}
              className="mt-2 w-full rounded border border-line bg-surface px-2 py-1 text-sm"
            />
          )}
          {results && (
            <p className={`mt-2 text-sm ${results[i].correct ? 'text-green-700' : 'text-red-700'}`}>
              {results[i].correct ? 'Correct! ' : `Not quite — the answer is "${results[i].correct_answer}". `}
              {results[i].explanation}
            </p>
          )}
        </div>
      ))}
      {!results && (
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
          className="rounded bg-primary px-4 py-2 text-primary-ink disabled:opacity-50"
        >
          {submitting ? 'Checking…' : 'Submit'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire it into `MessageThread`**

```tsx
// src/frontend/components/MessageThread.tsx — add import and render branch
import { PracticeTest } from './PracticeTest';
// ...inside the message bubble:
{m.content.type === 'practice_test' && conversationId && (
  <PracticeTest conversationId={conversationId} messageId={m.id} questions={m.content.questions} />
)}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/frontend/components/PracticeTest.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/frontend/components/PracticeTest.tsx src/frontend/components/PracticeTest.test.tsx \
  src/frontend/components/MessageThread.tsx
git commit -m "feat: add interactive practice test with submit-then-reveal"
```

---

## Task 15: Graph (Recharts)

**Files:**
- Create: `src/frontend/components/Graph.tsx`
- Modify: `src/frontend/components/MessageThread.tsx`
- Test: `src/frontend/components/Graph.test.tsx`

**Interfaces:**
- Produces: `Graph({ content: Extract<ModelContent, { type: 'graph' }> })`

- [ ] **Step 1: Write the failing test**

```tsx
// src/frontend/components/Graph.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Graph } from './Graph';

describe('Graph', () => {
  it('renders a title for a bar chart without crashing', () => {
    render(
      <Graph
        content={{ type: 'graph', chartType: 'bar', data: [1, 2, 3], labels: ['a', 'b', 'c'], title: 'Test Graph' }}
      />
    );
    expect(screen.getByText('Test Graph')).toBeInTheDocument();
  });

  it('renders without a title when none is provided', () => {
    render(<Graph content={{ type: 'graph', chartType: 'line', data: [1, 2, 3] }} />);
    expect(screen.queryByText('Test Graph')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/frontend/components/Graph.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `Graph`**

```tsx
// src/frontend/components/Graph.tsx
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ModelContent } from '../../types';

type GraphContent = Extract<ModelContent, { type: 'graph' }>;

function toChartData(data: unknown, labels?: string[]): { label: string; value: number }[] {
  const values = Array.isArray(data) ? (data as number[]) : [];
  return values.map((value, i) => ({ label: labels?.[i] ?? `${i + 1}`, value }));
}

export function Graph({ content }: { content: GraphContent }) {
  const chartData = toChartData(content.data, content.labels);

  return (
    <div className="w-full max-w-lg">
      {content.title && <p className="mb-2 font-medium">{content.title}</p>}
      <ResponsiveContainer width="100%" height={240}>
        {content.chartType === 'bar' ? (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
            <XAxis dataKey="label" stroke="var(--color-ink-muted)" />
            <YAxis stroke="var(--color-ink-muted)" />
            <Tooltip />
            <Bar dataKey="value" fill="var(--color-primary)" />
          </BarChart>
        ) : content.chartType === 'scatter' ? (
          <ScatterChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
            <XAxis dataKey="label" stroke="var(--color-ink-muted)" />
            <YAxis dataKey="value" stroke="var(--color-ink-muted)" />
            <Tooltip />
            <Scatter dataKey="value" fill="var(--color-primary)" />
          </ScatterChart>
        ) : (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
            <XAxis dataKey="label" stroke="var(--color-ink-muted)" />
            <YAxis stroke="var(--color-ink-muted)" />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="var(--color-primary)" />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Wire it into `MessageThread`**

```tsx
// src/frontend/components/MessageThread.tsx — add import and render branch
import { Graph } from './Graph';
// ...inside the message bubble:
{m.content.type === 'graph' && <Graph content={m.content} />}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/frontend/components/Graph.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/frontend/components/Graph.tsx src/frontend/components/Graph.test.tsx src/frontend/components/MessageThread.tsx
git commit -m "feat: add themed graph component via Recharts"
```

---

## Task 16: Admin panel

**Files:**
- Modify: `src/frontend/routes/Admin.tsx`
- Test: `src/frontend/routes/Admin.test.tsx`

**Interfaces:**
- Consumes: `listUsers`, `setUserRole`, `AdminUser` (Task 7); `useAuth` (Task 8)

- [ ] **Step 1: Write the failing test**

```tsx
// src/frontend/routes/Admin.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Admin } from './Admin';
import * as api from '../api/client';
import { AuthProvider } from '../context/AuthContext';

afterEach(() => vi.restoreAllMocks());

describe('Admin', () => {
  it('lists users, marks the acting admin as (you), and promotes a student via the role select', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@school.edu.au', name: 'Admin', role: 'admin', grade_or_subject: null, onboarded: 1 },
    });
    vi.spyOn(api, 'listUsers').mockResolvedValue({
      users: [
        { id: 'admin-1', email: 'admin@school.edu.au', name: 'Admin', role: 'admin', created_at: '2026-01-01' },
        { id: 'student-1', email: 'student@school.edu.au', name: 'Sam', role: 'student', created_at: '2026-01-02' },
      ],
    });
    const setRoleSpy = vi.spyOn(api, 'setUserRole').mockResolvedValue({ ok: true });

    render(
      <AuthProvider>
        <Admin />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('student@school.edu.au')).toBeInTheDocument());
    expect(screen.getByText('admin (you)')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('student'), { target: { value: 'teacher' } });
    await waitFor(() => expect(setRoleSpy).toHaveBeenCalledWith('student-1', 'teacher'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/frontend/routes/Admin.test.tsx`
Expected: FAIL — the stub has no table.

- [ ] **Step 3: Implement `Admin`**

```tsx
// src/frontend/routes/Admin.tsx
import { useEffect, useState } from 'react';
import { listUsers, setUserRole, type AdminUser } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../../types';

const ROLES: Role[] = ['student', 'teacher', 'admin'];

export function Admin() {
  const { user: actingUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);

  useEffect(() => {
    listUsers()
      .then(({ users }) => setUsers(users))
      .catch(() => setUsers([]));
  }, []);

  async function handleRoleChange(id: string, role: Role) {
    await setUserRole(id, role);
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="font-heading text-xl font-semibold">Users</h1>
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-ink-muted">
            <th className="py-2">Email</th>
            <th className="py-2">Name</th>
            <th className="py-2">Role</th>
            <th className="py-2">Joined</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-line">
              <td className="py-2">{u.email}</td>
              <td className="py-2">{u.name ?? '—'}</td>
              <td className="py-2">
                {u.id === actingUser?.id ? (
                  <span>{u.role} (you)</span>
                ) : (
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                    className="rounded border border-line bg-canvas px-2 py-1"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td className="py-2">{new Date(u.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/frontend/routes/Admin.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — every backend and frontend test, including `App.test.tsx`, still green.

- [ ] **Step 6: Run the build one more time**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/routes/Admin.tsx src/frontend/routes/Admin.test.tsx
git commit -m "feat: implement admin panel (user list + role management)"
```

---

## Final Verification (manual, after all tasks land)

Not a numbered task — this is run once, by driving an actual browser (`mcp__Claude_Browser__*` tools) against local `wrangler dev`, per the design spec's testing section. No automated harness for this; the magic-link token is read directly from local D1 (`wrangler d1 execute ncc-bot-db --local --command "SELECT token FROM magic_links ORDER BY expires_at DESC LIMIT 1"`) rather than adding any dev-only backend surface.

Sequence: login (request link → read token from D1 → navigate to `/auth/verify?token=...`) → onboarding (intro → name → grade/subject) → factual question → "do my homework" request (should be declined with scaffolding questions) → specific problem request (Socratic guidance, no direct answer) → flashcards (flip through them) → practice test (submit → reveal correct/incorrect + explanations) → graph (renders, styled to the active theme) → theme switch through all three (Light/Dark/NCC, instant, no reload) → log in as the `ADMIN_EMAIL` user, promote a student to teacher via `/admin`.

If anything in this pass fails, fix it and re-run the specific broken step (not the whole sequence) before considering the frontend done.

---

## Self-Review Notes

- **Spec coverage:** All of design spec §2 (backend additions, including the grading endpoint found during planning), §3 (project structure, tsconfig split, asset serving), §4 (routing, auth state, data fetching, theming), §5 (all five screens + all three rich-content renderers), §7 (component tests for practice-test reveal, flashcards, theme persistence, auth routing; manual E2E pass) are each covered by a task above. §6 (logo) is explicitly deferred — no source asset exists yet; documented in Task 9 rather than fabricated.
- **Type consistency checked:** `ClientMessage`, `ApiUser`, `GradeResult`, `AdminUser`, `Conversation` are defined once (Tasks 2 and 7) and referenced with the same names/shapes in every later task. `messageId` (added to the `POST /api/chat` response in Task 4) is consumed by `sendMessage`'s return type (Task 7) and `Chat.tsx`'s `handleSend` (Task 12) consistently.
- **Placeholder scan:** no TBD/TODO markers; every step has real, complete code.
