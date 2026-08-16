# NCC Bot Frontend — Design Spec

Status: approved
Author: Claude (with alex@NCC), 2026-08-17

## 1. Overview

The SPA for NCC Bot, building against the backend delivered in
[2026-08-16-ncc-bot-design.md](2026-08-16-ncc-bot-design.md). Same Worker,
same deploy — the Worker serves the built SPA as static assets and the SPA
calls same-origin `/api/*` and `/auth/*` routes. Two backend gaps (`GET
/api/me`, conversation history) are closed first since every screen depends
on them.

## 2. Backend additions

- **`GET /api/me`** — `requireAuth`. Returns the session `User` row as JSON
  (`id, email, name, role, grade_or_subject, onboarded`). 401 JSON if no
  valid session. Lets the SPA determine login state after the magic-link
  redirect lands on `/`.
- **`GET /api/conversations`** — `requireAuth`. New `db.listConversations(env,
  userId)` (mirrors `getConversation` but lists all, most-recent-first).
  Returns `{ conversations: [{ id, title, created_at }] }`.
- **`GET /api/conversations/:id`** — `requireAuth`; 404 if the conversation
  doesn't belong to the caller (same check `POST /api/chat` already does).
  New `db.getAllMessages(env, conversationId)` (uncapped, unlike
  `getRecentMessages`). Each row's `content` is `JSON.parse`d back to
  `ModelContent` and passed through `toClientSafeContent` before being
  returned — this is the chokepoint the tools.ts docstring specifically
  calls out for "any future conversation-history endpoint." Returns `{
  messages: [{ id, role, content, created_at }] }`, content already redacted.
- **`POST /api/conversations/:id/messages/:messageId/grade`** — `requireAuth`
  + the same ownership check. `toClientSafeContent` strips
  `correct_answer`/`explanation` from practice-test questions before they
  ever reach the client, so "submit-then-reveal" needs a grading round-trip:
  body `{ answers: string[] }` (by question index), looks up the *stored*
  (un-redacted) `ModelContent` for that message server-side, compares, and
  returns `{ results: { correct: boolean, correct_answer: string,
  explanation: string }[] }`. Without this, practice tests can be displayed
  but never graded — it's a small necessary addition beyond the two
  originally scoped, not an optional extra.

All four get route-level tests following the existing `loginAs()` pattern
in `test/chat-routes.test.ts`.

## 3. Project structure

Single `package.json`, single repo (per direction: no separate `frontend/`
package). React source lives under `src/frontend/`, kept out of the Worker's
type-checking:

```
src/
  frontend/
    main.tsx, App.tsx
    api/            — thin fetch wrapper, one function per endpoint
    context/         — AuthContext (current user), ThemeContext
    routes/          — Login, Onboarding, Chat, Admin screens
    components/      — Sidebar, MessageThread, MessageInput, Flashcards,
                        PracticeTest, Graph, ThemeSwitcher
    styles/          — theme.css (CSS custom properties: light/dark/ncc)
    index.html
  (existing Worker code unchanged)
```

`@cloudflare/workers-types` and DOM `lib` types conflict in one tsconfig
(both declare globals like `Response`), so `src/frontend/` gets its own
`tsconfig.frontend.json` (`lib: ["DOM", "ES2022"]`, `jsx: react-jsx`, no
`workers-types`), and the root `tsconfig.json`'s `include` excludes
`src/frontend`. `vite.config.ts` at the repo root treats `src/frontend` as
`root`, builds to `dist/`.

**Serving the build**: `wrangler.toml` gets an `[assets]` block (`directory
= "./dist"`, `binding = "ASSETS"`, `run_worker_first = ["/api/*",
"/auth/*"]` so those always hit the Hono app rather than the asset
matcher). `src/index.ts` gets a catch-all `app.get('*', ...)` (after
`/health`, `/auth`, `/api/*`) that calls `c.env.ASSETS.fetch(c.req.raw)`,
falling back to fetching `/index.html` when that 404s — the standard
SPA-fallback pattern, needed so a hard refresh on `/c/:id` or `/admin`
still serves the app shell instead of a 404.

`package.json` scripts: `build` becomes `vite build && wrangler deploy`'s
prerequisite (`"build": "vite build"`, `"deploy": "npm run build && wrangler
deploy"`). `dev` stays `wrangler dev` for the Worker; a separate `dev:frontend`
(`vite dev`, proxying `/api` and `/auth` to `wrangler dev`'s port) is added
for fast frontend iteration.

## 4. App architecture

- **Routing**: `react-router-dom`. Routes: `/login`, `/onboarding`, `/`
  (chat — shows the most recent conversation or an empty composer), `/c/:id`
  (a specific conversation), `/admin` (guarded: redirects non-admins to
  `/`).
- **Auth state**: `AuthContext` fetches `GET /api/me` once on mount.
  Three states: loading (spinner), logged-out (render `/login` regardless of
  route), logged-in (render the requested route; `onboarded: false` forces
  `/onboarding` regardless of route, mirroring the backend spec's "triggered
  client-side" note).
- **Data fetching**: plain `fetch` wrapped in `src/frontend/api/client.ts`
  (one small function per endpoint, credentials: 'include', JSON in/out,
  throws on non-2xx). No React Query / SWR — the app has ~6 endpoints and no
  cross-component cache-sharing need beyond "sidebar list refreshes after
  sending a message," which a single refetch call after `POST /api/chat`
  resolves. Matches this codebase's YAGNI-first style seen in the backend.
- **Theme**: `ThemeContext` holds `'light' | 'dark' | 'ncc'`, persisted to
  `localStorage`, applied as `data-theme` on `<html>`. `styles/theme.css`
  defines CSS custom properties per theme (colors, fonts) per the backend
  spec's section 11 (NCC red/blue/gold, Montserrat headings, Inter/Work Sans
  body). Tailwind config maps utility classes to these custom properties
  (e.g. `bg-surface`, `text-primary`) rather than hardcoded palette values,
  so the same Tailwind classes repaint under all three themes.

## 5. Screens

- **Login** (`/login`): email input → `POST /auth/request`. On success,
  swaps to a "check your email" state (no polling — the redirect from
  clicking the emailed link is what moves the user forward). Client-side
  `.edu.au` hint (not enforced client-side beyond a hint — the backend is
  the actual gate).
- **Onboarding** (`/onboarding`): fully client-scripted (no Gemini call) —
  matches the backend's `POST /api/onboarding` contract, which only accepts
  `{ name, gradeOrSubject }`. Rendered as a chat-like sequence: a canned bot
  intro message (what the bot is, that it can be wrong), then a name prompt,
  then a grade/subject prompt, each appearing as the previous is answered.
  On completion, `POST /api/onboarding`, then refetch `/api/me` and route to
  `/`.
- **Chat** (`/`, `/c/:id`): `Sidebar` (conversation list from `GET
  /api/conversations`, "new chat" action) + `MessageThread` (renders
  messages in order, dispatching by `content.type`) + `MessageInput`
  (textarea + send, disabled while awaiting a reply). Opening `/c/:id` fetches
  `GET /api/conversations/:id` for history. Sending calls `POST /api/chat`
  with the current `conversationId` (or none, for a fresh chat — the
  response's `conversationId` is then pushed into the URL via
  `navigate`).
- **Rich content renderers** (inline in `MessageThread`, one component per
  `ModelContent` type):
  - `Flashcards`: deck of cards, click/tap to flip (front↔back), prev/next.
  - `PracticeTest`: renders `prompt` + `choices` per question with no
    answer/explanation shown (server already redacts these). On "Submit",
    posts the student's picks to the new grade endpoint (§2) and renders
    the returned per-question `correct`/`correct_answer`/`explanation` —
    answers are never known client-side before that response lands.
  - `Graph`: Recharts, chart type from `chartType` (`line`/`bar`/`scatter`
    mapped to the matching Recharts component), styled via the same CSS
    custom properties (per the dataviz skill's guidance), rendered inside a
    responsive container.
- **Admin** (`/admin`, admin-only): table from `GET /api/admin/users`
  (email, name, role, created_at) with a role `<select>` per row calling
  `POST /api/admin/users/:id/role` on change; the acting admin's own row
  hides the option to self-demote away from `admin` (mirrors the backend's
  refusal) rather than letting the request round-trip to a 400.
- **Theme switcher**: a persistent control (header) cycling the three
  themes, backed by `ThemeContext`.

## 6. Theming source assets

The NCC shield logo (light-background version) is used as provided. A
dark-theme shield-only transparent variant is generated from it during
implementation (image edit, not code).

## 7. Testing

- **Component tests** (Vitest + `@testing-library/react`, `jsdom`
  environment — a second Vitest project alongside the existing
  Workers-pool one, via `vitest.workspace.ts` so `npm test` runs both):
  - `PracticeTest`: choosing answers is disabled/enabled correctly,
    "Submit" triggers the grade call, results (correct/incorrect +
    explanation) render only after that response returns, not before.
  - `Flashcards`: flip toggles visible face; prev/next changes card index.
  - `ThemeContext`: selecting a theme updates `data-theme` and persists
    across a simulated remount (reads back from `localStorage`).
  - `AuthContext`: routes to `/login` when `/api/me` 401s, to `/onboarding`
    when `onboarded: false`.
- **Manual end-to-end pass**: driven by Claude in an actual browser against
  local `wrangler dev`, reading the magic-link token from local D1 (no new
  backend surface for this — see clarifying answer). Walks: login → click
  emailed link → onboarding → factual question → "do my homework" request →
  specific problem request → flashcards → practice test (submit → reveal) →
  graph → theme switch (all three) → admin promotion. Same sequence the
  backend spec's section 14 already lists, now actually run end-to-end
  through the UI instead of via API calls.

## 8. Non-goals (unchanged from backend spec)

No streaming responses (backend returns one full reply per turn — no SSE/
websocket needed client-side), no offline support, no native app, no
per-class policy configuration UI.
