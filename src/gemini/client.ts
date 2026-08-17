export interface GeminiMessage {
  role: 'user' | 'model';
  text: string;
}

export interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiResult {
  text: string | null;
  functionCall: FunctionCall | null;
}

export interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

export interface GroundedResult {
  text: string | null;
  chunks: GroundingChunk[];
  queries: string[];
  searchEntryPoint: string | null;
}

/**
 * Conversation quality — step-by-step working in particular — is model-bound, so
 * chat runs on the mid-tier model. Memory summarization is invisible bookkeeping
 * and stays on the cheapest one.
 */
export const CHAT_MODEL = 'gemini-3.5-flash';
export const SUMMARY_MODEL = 'gemini-3.5-flash-lite';

/**
 * Reasoning depth, and the single biggest lever on cost here.
 *
 * Measured against this workload: a three-sentence factual answer billed 146 output
 * tokens but 958 tokens of hidden reasoning — 87% of the bill was thinking. Dropping
 * to "low" roughly halves total tokens per turn, and it was checked against the
 * hardest path (a tool-called worked example with step-by-step algebra), which still
 * produced a correct, genuinely parallel problem with the same number of steps.
 *
 * Raise to "medium" if answer quality ever visibly regresses; do not set both this and
 * thinkingBudget, as Gemini 3 models reject the combination.
 */
export const THINKING_LEVEL = 'low';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function endpoint(model: string, method: string, query = ''): string {
  return `${BASE}/${model}:${method}${query}`;
}

function buildBody(systemInstruction: string, history: GeminiMessage[], tools: unknown[]) {
  return {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: { thinkingConfig: { thinkingLevel: THINKING_LEVEL } },
    ...(tools.length ? { tools: [{ functionDeclarations: tools }] } : {}),
  };
}

interface Candidate {
  content?: { parts?: { text?: string; functionCall?: FunctionCall }[] };
  groundingMetadata?: {
    groundingChunks?: GroundingChunk[];
    webSearchQueries?: string[];
    searchEntryPoint?: { renderedContent?: string };
  };
}

export async function callGemini(
  apiKey: string,
  systemInstruction: string,
  history: GeminiMessage[],
  tools: unknown[],
  fetchImpl: typeof fetch = fetch,
  model: string = CHAT_MODEL
): Promise<GeminiResult> {
  const res = await fetchImpl(endpoint(model, 'generateContent'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(buildBody(systemInstruction, history, tools)),
  });

  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { candidates?: Candidate[] };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const textPart = parts.find((p) => typeof p.text === 'string');
  const fnPart = parts.find((p) => p.functionCall);

  return {
    text: textPart?.text ?? null,
    functionCall: fnPart?.functionCall ?? null,
  };
}

export type StreamEvent =
  | { kind: 'text'; delta: string }
  | { kind: 'functionCall'; call: FunctionCall };

/**
 * SSE frames are separated by a blank line, and Gemini sends CRLF line endings —
 * so the real separator on the wire is `\r\n\r\n`. Matching only `\n\n` finds no
 * frames at all and silently yields an empty response.
 */
const FRAME_SEPARATOR = /\r?\n\r?\n/;

/** Extracts the stream events carried by one complete SSE frame. */
function parseFrame(frame: string): StreamEvent[] {
  const events: StreamEvent[] = [];

  for (const line of frame.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;

    let parsed: { candidates?: Candidate[] };
    try {
      parsed = JSON.parse(payload) as { candidates?: Candidate[] };
    } catch {
      continue; // a partial or non-JSON keepalive frame
    }

    for (const part of parsed.candidates?.[0]?.content?.parts ?? []) {
      if (part.functionCall) events.push({ kind: 'functionCall', call: part.functionCall });
      else if (typeof part.text === 'string' && part.text) events.push({ kind: 'text', delta: part.text });
    }
  }

  return events;
}

/**
 * Streams a chat turn as Server-Sent Events. Yields text deltas as they arrive and
 * a single functionCall event if the model chooses a tool instead of prose.
 */
export async function* streamGemini(
  apiKey: string,
  systemInstruction: string,
  history: GeminiMessage[],
  tools: unknown[],
  fetchImpl: typeof fetch = fetch,
  model: string = CHAT_MODEL
): AsyncGenerator<StreamEvent, void, void> {
  const res = await fetchImpl(endpoint(model, 'streamGenerateContent', '?alt=sse'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(buildBody(systemInstruction, history, tools)),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // A frame may span several reads, so only complete ones are consumed here and
    // the remainder is carried forward.
    let match = FRAME_SEPARATOR.exec(buffer);
    while (match) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      match = FRAME_SEPARATOR.exec(buffer);
      yield* parseFrame(frame);
    }
  }

  // A final frame with no trailing blank line would otherwise be dropped.
  if (buffer.trim()) yield* parseFrame(buffer);
}

/**
 * A search-grounded call. Deliberately separate from the main chat turn: grounding
 * is billed per search and its terms carry a display obligation, so it runs only
 * when the model has explicitly asked for sources.
 *
 * The caller must build citations from `chunks` (URLs the Search API actually
 * returned) and never from URLs appearing in `text`, which the model may invent.
 */
export async function searchGrounded(
  apiKey: string,
  prompt: string,
  fetchImpl: typeof fetch = fetch,
  model: string = CHAT_MODEL
): Promise<GroundedResult> {
  const res = await fetchImpl(endpoint(model, 'generateContent'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { thinkingConfig: { thinkingLevel: THINKING_LEVEL } },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini grounding error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { candidates?: Candidate[] };
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const meta = candidate?.groundingMetadata;

  return {
    text: parts.find((p) => typeof p.text === 'string')?.text ?? null,
    chunks: meta?.groundingChunks ?? [],
    queries: meta?.webSearchQueries ?? [],
    searchEntryPoint: meta?.searchEntryPoint?.renderedContent ?? null,
  };
}
