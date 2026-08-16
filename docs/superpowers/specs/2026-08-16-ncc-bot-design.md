# NCC Bot — Design Spec

Status: approved
Author: Claude (with alex@NCC), 2026-08-16

## 1. Overview

NCC Bot is a Socratic AI tutoring assistant for a school, proposed as an
alternative to banning AI outright: instead of giving students answers, it
teaches them how to get there themselves — while still being genuinely useful
for factual questions, study aids, and (for staff) direct help.

Runs as a single Cloudflare Worker (API + static SPA), backed by Cloudflare
D1, calling the Gemini API for all generation.

## 2. Goals

- Tutor students without doing their work for them (Socratic method)
- Answer factual/informational questions directly (it's still a helpful tool)
- Generate study aids on request: flashcards, practice tests, explanatory graphs
- Remember each student across sessions (rolling summary + recent history)
- Restrict signup to `.edu.au` email addresses, no self-service role escalation
- Role-adjusted behavior: student (Socratic), teacher/admin (direct, unrestricted)
- Reusable, themeable UI (Light default, Dark, NCC brand) resembling Gemini's chat UI

## 3. Non-goals (for this iteration)

- Per-class / per-assignment teacher-configurable policy (global policy only for now)
- Rate limiting / abuse throttling beyond a basic per-user cap (noted as future work)
- Google Sheets integration (dropped in favor of D1 — see decision log)
- Native mobile app (responsive web only)

## 4. Architecture

```
Browser (React SPA, Vite build)
        │
        ▼
Cloudflare Worker (Hono)
  ├── /auth/*        magic-link request + verify, session cookie
  ├── /api/chat       Gemini call, tool-use dispatch, memory read/write
  ├── /api/admin/*     role management (admin only)
  └── static assets   SPA build output
        │
        ├──▶ Cloudflare D1 (users, sessions, conversations, messages, memory)
        ├──▶ Gemini API (chat + function-calling)
        └──▶ Resend (magic-link emails)
```

Frontend and backend are one deployable unit: the Worker serves the built SPA
via Workers Static Assets, and the SPA calls same-origin `/api/*` routes — no
CORS configuration needed.

## 5. Data model (Cloudflare D1)

```sql
users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'student', -- student | teacher | admin
  grade_or_subject TEXT,
  onboarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)

magic_links (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
)

sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
)

conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT,
  created_at TEXT NOT NULL
)

messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL, -- user | model
  content TEXT NOT NULL,   -- may contain a JSON block for rich content (flashcards/test/graph)
  created_at TEXT NOT NULL
)

memory_summaries (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  summary_text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
)
```

## 6. Auth & roles

- Sign-in is email-only. `/auth/request` rejects any email not ending in
  `.edu.au` before a link is ever sent.
- `/auth/request`: generate a random token, store in `magic_links` with a
  short expiry (~15 min), email a link via Resend.
- `/auth/verify?token=...`: validate token unused + unexpired, mark used,
  create-or-fetch the `users` row, issue a signed HttpOnly session cookie.
- First login: if `email === env.ADMIN_EMAIL`, role is set to `admin`.
  Otherwise role defaults to `student`.
- Admins get `/api/admin/users` (list) and `/api/admin/users/:id/role`
  (promote/demote to `teacher`/`admin`). Students cannot self-escalate; no
  client-controlled role field is ever trusted.

## 7. Onboarding

Triggered client-side when `user.onboarded === false`. Runs as a scripted
first conversation rather than a form:

- NCC Bot introduces itself, including the ddb-style disclaimer: what it is
  and that it can be wrong, so the student should think critically about its
  answers.
- Asks preferred name, grade/subject (students) or subject taught
  (teachers/admins).
- Students additionally get a couple of light questions about how they like
  to learn, used to seed `memory_summaries`.
- On completion: `users.onboarded = 1`, profile fields saved.

## 8. Tutoring policy

Enforced primarily via system prompt, applied only when `role === 'student'`
(teachers/admins get direct, unrestricted answers).

Three request categories, classified by the model itself per-message (not
pre-classified by our code):

1. **Factual/conceptual/definitional** ("what is an API," "what is QCAA,"
   "explain photosynthesis") → answer directly.
2. **"Do the work for me"** requests for a deliverable ("write me an essay,"
   "write this code for me," "do this assignment") → declined; bot instead
   asks scaffolding questions (goal, constraints, what they've tried, what
   their plan is) — mirrors CS50 duck-debugger's response to "can you write
   me a chatbot."
3. **Specific problem-solving** (a specific homework/exercise question) →
   Socratic guidance only. No direct answer. When an example is useful, it
   must use a **related but different** problem than the one asked, and the
   bot should prompt the student to attempt the next step themselves.

Study aids (flashcards, practice tests, graphs) the student explicitly
requests are always generated directly — producing them is a study activity,
not an answer shortcut.

**Caveat to set expectations on:** this is prompt-level enforcement, not a
hard guarantee. A determined student may find prompt-injection workarounds
despite hardening (ignoring embedded instructions in conversation history,
resisting "ignore previous instructions"-style attempts). Worth monitoring via
the stored conversation logs rather than assuming it's unbreakable.

## 9. Memory

- Each conversation keeps the last N messages (N ≈ 20) verbatim.
- When a conversation exceeds N, the oldest turns are folded into that
  student's `memory_summaries` row via a summarization call (learning style,
  recurring struggle areas, topics covered), then dropped from raw storage.
- Every chat turn sends to Gemini: system prompt + role + student profile +
  `memory_summaries.summary_text` + last N raw messages.

## 10. Rich content (tool-use)

Gemini function-calling defines structured tools the model can invoke instead
of (or alongside) plain text:

- `render_flashcards(cards: {front, back}[])` → flippable card deck UI
- `render_practice_test(questions: {prompt, choices?, correct_answer,
  explanation}[])` → interactive quiz; answers/explanations are withheld in
  the UI until the student submits, then shown with feedback
- `render_graph(type, data, labels, title)` → chart rendered client-side
  with a lightweight charting library, styled to the active theme (built
  following the dataviz skill's guidance for accessible, consistent charts)

The frontend renders these as real components inline in the chat, not as
text/JSON dumps.

## 11. Theming & branding

CSS custom properties drive theme switching (instant, no reload). Three
themes shipped initially:

- **Light** — Gemini-like neutral default
- **Dark** — same layout, dark palette
- **NCC** — built from Newman Catholic College's public site tokens:
  red `#DA2032`, blue `#0057B8`, gold `#FEB913`, paragraph `#434342`.
  Headings in **Montserrat** (Google Fonts, free). Body font: Avenir Pro
  (the site's actual body font) is commercially licensed, so a free
  geometric-sans substitute (Inter or Work Sans) is used instead for the
  same feel without a licensing issue.

Logo: the attached NCC shield is used as-is on light backgrounds. For the
dark theme, a text-free, shield-only transparent variant is generated from
the source image during implementation.

## 12. Secrets & deployment

Set via `wrangler secret put`, never committed or hardcoded:
`GEMINI_API_KEY`, `RESEND_API_KEY`, `ADMIN_EMAIL`, session-signing secret.

D1 database binding declared in `wrangler.toml`. Both API keys shared earlier
in this conversation should be rotated in their respective dashboards before
(or shortly after) launch, since they were exposed in plaintext chat.

## 13. Open items to resolve during implementation

- **Model ID**: confirmed via live API call — `gemini-3.5-flash-lite` is a
  real, current model (1,048,576 input token limit, supports
  `generateContent`). Use this exact ID.
- Basic per-user rate limiting on `/api/chat` (cheap D1 or KV counter) to
  guard against runaway Gemini spend — small addition, worth doing even
  though it wasn't explicitly requested, given a real API key is involved.

## 14. Testing

- Unit tests: `.edu.au` domain gate, role-based system-prompt construction,
  memory summarization trigger, tool-call → structured content mapping.
- Manual pass: onboarding → factual question → "do my homework" request →
  specific problem request → flashcards → practice test → graph → theme
  switch → admin promotion, in an actual browser.
