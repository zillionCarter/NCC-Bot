# NCC Bot overhaul — design

Date: 2026-08-17

## Why

The bot answered questions but presented badly and did too little:

- Model text was rendered as `whitespace-pre-wrap` plain text, so Markdown arrived
  literally — every `**` was visible and mathematics was unreadable ASCII.
- Only three skills existed (flashcards, practice test, single-series graph).
- No welcome screen: a new user faced an empty box with no idea what to ask.
- The UI was unstyled scaffolding rather than a designed product.
- Roles (`student` / `teacher` / `admin`) branched the model's behaviour.

The tutoring policy itself was **correct** and is kept: straight answers to real
questions, guidance rather than deliverables for assessable work. This overhaul
sharpens it and builds everything around it.

## Behaviour: one policy, three kinds of request

`buildSystemPrompt` no longer takes a role. Every account gets one policy that
sorts each request into exactly one kind:

1. **A question with a knowable answer** — answer directly and completely. No
   Socratic runaround. A person who cannot get a straight answer stops asking.
2. **A request to produce assessable work** — never produce it, including
   near-misses that could be handed up after light editing. Do what a teacher does
   at the desk: interrogate the thesis, explain the marking, offer structure,
   critique their draft, find them sources.
3. **A specific problem they were set** — never answer *their* instance. Emit a
   **parallel problem**: same structure and method, different values, solved in
   full, then hand the method back.

Kind 3 is the product's thesis, so it is enforced by a tool rather than by hope.
`render_worked_example` requires `original_restated`, `parallel_problem` and
`what_changed`; requiring `what_changed` forces an actual substitution. The card
shows their problem beside the practice version, so a student can see for
themselves that the example really is different.

The `role` column stays in the schema (unused by behaviour) and the admin user list
stays, gated by the `ADMIN_EMAIL` secret. There are no visible tiers.

## Skills

| Tool | Renders |
|---|---|
| `render_worked_example` | Parallel problem, revealed step by step, typeset maths |
| `render_interactive_graph` | Multi-series charts, and function plots whose coefficients are sliders |
| `render_diagram` | Mermaid flowcharts, mind maps, timelines, sequences |
| `render_table` | Sortable tables, LaTeX allowed in cells |
| `render_summary` | TL;DR, key points, key terms |
| `render_study_plan` | Dated sessions with tickable tasks |
| `find_sources` | Real, citable pages — see below |
| `render_flashcards`, `render_practice_test` | Recall practice and self-testing |

The legacy `graph` content type is retained and normalized onto
`interactive_graph`, because conversations created before this change still hold
rows in the old shape.

### Source finding without fabricated links

A bot inventing plausible URLs for a school assignment is worse than useless, so
the integrity guarantee is structural rather than a matter of prompting:

- `find_sources` triggers a **second, search-grounded** Gemini call
  (`tools: [{ google_search: {} }]`), separate from the chat turn. Grounding is
  billed per search and carries a display obligation, so it runs only when the
  model has explicitly asked for sources.
- Every source card is built **only** from
  `groundingMetadata.groundingChunks[].web.uri` — URLs the Search API actually
  returned. The model's prose is kept as advisory `note` text and is never mined
  for URLs, so there is no path by which it can invent a citation.
- Chunk URIs are Google redirect links, so `web.title` supplies the publisher
  domain a student needs in order to judge the source.
- Grounding's terms require displaying Google's `searchEntryPoint.renderedContent`
  alongside a grounded answer. It is third-party HTML, so it renders inside a
  sandboxed `iframe srcDoc` rather than being injected into our DOM.

## Rendering

One `<Markdown>` component is the single path for all model-authored text — chat
turns, worked-example steps, summaries, table cells, quiz prompts. Consistency
across surfaces is the point.

- `remark-gfm` + `remark-math` + `rehype-katex`, plus a local
  `rehypeHighlightLite` plugin over `lowlight`. (`rehype-highlight` statically
  imports lowlight's `common` set, so its `languages` option cannot shrink the
  bundle; building the lowlight instance ourselves keeps it to twelve grammars.)
- Raw HTML stays disabled — no `rehype-raw`. Model output must never become live
  markup.
- `normalizeMarkdown` reconciles what the model writes with what remark-math can
  read: `\(…\)` and `\[…\]` become the dollar form, and a **lone** `$` on a line is
  escaped as currency, since remark-math would otherwise swallow the rest of the
  line hunting for a partner. Code fences and inline code are skipped.
- `asMath(latex, display)` emits display maths with its delimiters **on their own
  lines**. A single-line `$$x$$` is inline as far as remark-math is concerned,
  which silently produces cramped mid-sentence equations where a centred one was
  intended.

## Design direction

Institutional and typographic — an annotated exercise book, not a chat app.

- **Type**: self-hosted, no CDN request. **Literata** (variable) for display and
  reading, because KaTeX sets maths in a serif and the pairing makes an answer look
  typeset rather than pasted. **Atkinson Hyperlegible Next** for body and UI,
  chosen for this brief specifically: it was drawn for character disambiguation,
  which is what a screen full of `1/l/I` and `0/O` needs. **IBM Plex Mono** for
  code, data and labels.
- **Colour**: cool-neutral paper (`#fafaf8`, never pure white) with cards lifting to
  true white above it; fountain-pen blue-black ink rather than `#000`; the NCC blue
  as the single functional accent. Graph-paper grid, tinted from the accent because
  real graph paper is printed in pale blue, confined to surfaces where working-out
  happens. The school yellow is demoted to exactly one job: a highlighter stroke
  behind the line that hands the method back.
- **Structure**: every turn hangs off a gutter label naming the speaker; every
  generated artifact carries a mono eyebrow naming its type. Both encode something
  true rather than decorating.
- **Motion**: CSS only — a 200 ms rise on arrival, a streaming caret, a left-anchored
  slide for the drawer. `prefers-reduced-motion` honoured globally.
- **Light only.** Dark mode was built and then removed at the client's request, along
  with the theme context, the switcher and the `data-theme` attribute. `<meta
  name="color-scheme" content="light">` stops the browser auto-darkening controls on
  a device set to dark.

## Responsiveness

Verified with no horizontal overflow at 320, 375, 768 and 1440 px.

- **Type scale is fluid**: `--text-lead` through `--text-hero` use `clamp()`, so a
  320 px phone and a 1600 px desktop both get sensible headings without a breakpoint
  for every step.
- **The speaker gutter collapses below `md`.** A fixed 3.5 rem gutter ate a fifth of
  a 320 px screen, squeezing equations and tables for a five-character label; below
  `md` the label sits above the message instead.
- **Side-by-side worked examples move to `md`.** Two equations at 640 px were too
  tight to read, so they stack until there is genuine room.
- **Charts scale**: `h-56 sm:h-64 lg:h-72` rather than one fixed 260 px height.
- **The reading column widens past `lg`** so charts, tables and diagrams get real
  desktop room, while prose stays capped at `--measure`.
- **Display maths aligns left under 480 px**, because a centred equation that
  overflows scrolls away from its own start.
- **Hover-only controls are reachable on touch.** Rename, delete and copy used
  `opacity-0 group-hover:opacity-100`, which on a touch screen means never visible
  and never usable. `.hover-reveal` is visible by default and only hides behind hover
  on devices that report `(hover: hover) and (pointer: fine)`.

## Streaming

`POST /api/chat/stream` returns SSE (`start`, `delta`, `tool`, `done`, `error`).
It is a separate endpoint rather than content negotiation on `/api/chat`, so the
JSON contract stays byte-for-byte unchanged and remains available to clients that
cannot stream. Both routes share one `prepareTurn` pipeline — validation, rate
limiting, conversation resolution, user-message persistence — so they cannot drift.

There is deliberately **no** automatic fallback from the stream to the JSON route:
the user's message and rate-limit quota are already committed server-side by the
time a stream can fail, so a silent retry would double-post the message. Failures
surface with a retry the student chooses.

If a tool call arrives mid-stream, any streamed prose was preamble to the card
replacing it, so the client is told to clear it rather than leaving half a sentence
above the artifact.

## Auth

Unchanged in shape: email only, no passwords, portable across devices. Added a
6-digit code as an alternative to clicking the link, for a device where opening the
mailbox is awkward. Codes live on the same `magic_links` row (migration
`0003_magic_link_codes.sql`), share the 15-minute window, and are single-use. A
6-digit space is only 10^6 wide, so each wrong guess burns an `attempts` counter
against every live link for that address; once the allowance is gone the correct
code stops working too.

## Model

Chat moves to `gemini-3.5-flash`; memory summarization stays on
`gemini-3.5-flash-lite`. Step-by-step working and clean formatting are partly
model-bound, and summarization is invisible bookkeeping where quality does not show.

## Bug found after first delivery: empty replies

Every chat returned "Sorry, I couldn't generate a response."

Gemini's SSE stream separates frames with **`\r\n\r\n`**, not `\n\n`.
`streamGemini` searched for `\n\n`, matched nothing, and so parsed zero frames —
the accumulated text stayed empty and every turn fell through to the empty-response
fallback. Both parsers now match `/\r?\n\r?\n/` and split frame lines on
`/\r?\n/`, and both flush a trailing frame that arrives without a blank line.

The tests did not catch it because the fixtures were written from the same wrong
assumption as the code. They now use captured real-wire framing, including a read
that splits the CRLF separator itself.

## School knowledge, policy retrieval and cost (2026-08-18)

### Knowing the school

`school/facts.ts` holds a compact always-on block: name, Smithfield/Cairns location,
Diocese of Cairns, the JCU precinct and agreement, Years 7-12, QCAA, patron Saint John
Henry Newman, the College blessing, the five values, the four behaviour expectations,
the device rule, uniform, and plagiarism-as-theft. It ends by forbidding invention of
any rule, staff name, date or room it was not given.

### Policy retrieval, gated for free

The three PDFs in `docs/` are transcribed into `school/policies.ts` as six keyword-tagged
sections. `findRelevantPolicies()` matches the student's message locally — no model
call, no tokens — and `buildPolicyContext()` attaches at most two sections to that one
turn. A question about photosynthesis therefore pays **nothing** for the policy corpus,
which is the whole point.

Two things learned building the matcher:

- **Substring matching was badly wrong.** "What is photosynthesis?" contains "hat" and
  so attached the uniform policy. Keywords now require a word boundary at the start
  only, which still lets the "plagiar" stem catch both plagiarism and plagiarise.
- **Bare "device"/"devices" had to go**, or an English student asking about literary
  devices got the electronics policy.

The uniform brochure is almost entirely photographs, so the garment specifics are not
machine-readable. Rather than let the model fill that gap, the section states the limit
explicitly and directs students to the brochure, their diary or the uniform shop. This
is verified end to end: asked for an exact sock colour, it declines and redirects.

### Cost

Measured against the live API, not estimated:

| Change | Effect |
|---|---|
| `thinkingLevel: 'low'` | Trivial question: 1,132 → 574 total tokens (**-49%**). Worked example: 1,242 → 754 (**-39%**) |
| History window 20 → 12 messages | Fewer re-billed messages every turn |
| Policy text gated on local keyword match | ~0 tokens on non-policy turns instead of ~3,000 |
| System prompt tightened | 6,599 → 6,659 chars *while adding* school facts and a voice block — net neutral |

The headline finding: a three-sentence factual answer billed 146 output tokens and
**958 tokens of hidden reasoning** — 87% of the bill was thinking nobody reads.
Dropping to `low` was checked against the hardest path (tool-called worked example with
step-by-step algebra) and still produced a correct, genuinely parallel problem with the
same step count, so the saving costs no quality. Raise to `medium` if that ever
regresses; the two settings are mutually exclusive with `thinkingBudget`.

### Voice

A `VOICE` block gives it a defined personality: warm and direct, Australian spelling and
Queensland school vocabulary, occasional first-name use, encouragement that is specific
or absent, no moralising, no performed AI enthusiasm.

## Known limitations

- **Study-plan ticks are per-device**, held in `localStorage`. That sits awkwardly
  with an otherwise device-portable app; it avoids a migration and a write endpoint
  for a low-stakes checkbox. Worth revisiting if students rely on it.
- **The conversation list mounts twice on mobile** — the desktop sidebar is hidden
  with CSS rather than unmounted, so opening the drawer costs a second
  `/api/conversations` fetch. Idempotent and cheap; fixing it means one sidebar
  repositioned by CSS.
- **Policy matching is keyword-based**, so it can miss a question phrased without any
  of the trigger words, and can attach a section unnecessarily on a coincidental match.
  A miss costs an unpolicied answer; a false positive costs a few hundred tokens. A
  small embedding index would be more robust if the corpus grows.
- **The uniform garment specifics are unavailable** to the bot at all, because the
  brochure is images. Extracting them would need OCR or a text version from the College.
- `ALLOW_ANY_EMAIL_DOMAIN = "true"` remains in committed production vars, so any
  email domain can sign in. Flagged, not changed — it is a deliberate testing
  setting and removing it is a launch decision.
