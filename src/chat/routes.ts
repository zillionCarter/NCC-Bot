import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AppEnv } from '../index';
import type { Env, ModelContent, User } from '../types';
import * as db from '../db';
import { requireAuth } from '../auth/middleware';
import { callGemini, streamGemini, type FunctionCall, type GeminiMessage } from '../gemini/client';
import { buildSystemPrompt } from '../gemini/systemPrompt';
import { TOOL_DECLARATIONS, functionCallToContent, modelContentToText, toClientSafeContent } from '../gemini/tools';
import { findSources } from '../sources/finder';
import { buildPolicyContext } from '../school/policies';
import { getConversationContext, maybeSummarize } from '../memory';

export const chatRoutes = new Hono<AppEnv>();

const CHAT_WINDOW_MS = 60 * 1000;
const CHAT_MAX_PER_WINDOW = 15;
const TITLE_MAX_LENGTH = 60;

interface PreparedTurn {
  conversationId: string;
  isNewConversation: boolean;
  systemPrompt: string;
  history: GeminiMessage[];
}

type PrepareResult =
  | { ok: true; turn: PreparedTurn }
  | { ok: false; status: 400 | 404 | 429; error: string };

/**
 * Everything a turn needs before the model is called: validation, rate limiting,
 * conversation resolution and persistence of the user's message. Shared by the
 * JSON and SSE routes so the two can never drift apart on any of it.
 */
async function prepareTurn(
  env: Env,
  user: User,
  body: { conversationId?: string; message?: string }
): Promise<PrepareResult> {
  const message = body.message?.trim();
  if (!message) return { ok: false, status: 400, error: 'message is required' };

  const allowed = await db.checkAndIncrementRateLimit(env, user.id, CHAT_WINDOW_MS, CHAT_MAX_PER_WINDOW);
  if (!allowed) {
    return { ok: false, status: 429, error: 'Too many messages — please wait a moment and try again.' };
  }

  let conversationId = body.conversationId;
  let isNewConversation = false;
  if (conversationId) {
    const existing = await db.getConversation(env, conversationId, user.id);
    if (!existing) return { ok: false, status: 404, error: 'conversation not found' };
  } else {
    conversationId = crypto.randomUUID();
    isNewConversation = true;
    await db.createConversation(env, conversationId, user.id, message.slice(0, TITLE_MAX_LENGTH));
  }

  await db.addMessage(env, crypto.randomUUID(), conversationId, 'user', message);

  const [history, memorySummary] = await Promise.all([
    getConversationContext(env, conversationId),
    db.getMemorySummary(env, user.id),
  ]);

  const systemPrompt = buildSystemPrompt({
    name: user.name,
    gradeOrSubject: user.grade_or_subject,
    memorySummary,
    // Local keyword match, so a turn that is not about school policy pays nothing
    // for the policy corpus — no extra model call, no extra tokens.
    policyContext: buildPolicyContext(message),
  });

  return {
    ok: true,
    turn: {
      conversationId,
      isNewConversation,
      systemPrompt,
      history: history.map((m) => ({
        role: m.role,
        text: m.role === 'model' ? modelContentToText(JSON.parse(m.content) as ModelContent) : m.content,
      })),
    },
  };
}

/**
 * Most tools render straight from their arguments. `find_sources` is different: it
 * needs a second, search-grounded call before there is anything to show.
 */
async function resolveToolCall(env: Env, call: FunctionCall): Promise<ModelContent> {
  if (call.name === 'find_sources') {
    const topic = typeof call.args?.topic === 'string' ? call.args.topic : '';
    const context = typeof call.args?.context === 'string' ? call.args.context : undefined;
    return findSources(env.GEMINI_API_KEY, topic, context);
  }
  return functionCallToContent(call);
}

async function finishTurn(
  env: Env,
  userId: string,
  conversationId: string,
  content: ModelContent
): Promise<string> {
  const messageId = crypto.randomUUID();
  await db.addMessage(env, messageId, conversationId, 'model', JSON.stringify(content));

  // Summarization is best-effort background bookkeeping, not part of this turn's
  // contract: the reply is already generated and persisted, so a Gemini failure or
  // a malformed stored row here must not turn a successful reply into an error.
  try {
    await maybeSummarize(env, userId, conversationId);
  } catch {
    // swallow — the conversation keeps its full history until the next
    // successful summarization pass folds it.
  }

  return messageId;
}

function contentFromResult(text: string | null): ModelContent {
  return { type: 'text', text: text ?? "Sorry, I couldn't generate a response." };
}

chatRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req
    .json<{ conversationId?: string; message?: string }>()
    .catch(() => ({}) as { conversationId?: string; message?: string });

  const prepared = await prepareTurn(c.env, user, body);
  if (!prepared.ok) return c.json({ error: prepared.error }, prepared.status);
  const { conversationId, systemPrompt, history } = prepared.turn;

  // The user's message and rate-limit quota are already persisted by the time we
  // get here, so a Gemini failure must not throw out of the handler — that would
  // fall through to Hono's default text/plain error handler and break the JSON
  // contract every other route honors, leaving a dangling user turn with no reply.
  let modelContent: ModelContent;
  try {
    const result = await callGemini(c.env.GEMINI_API_KEY, systemPrompt, history, [...TOOL_DECLARATIONS]);
    modelContent = result.functionCall
      ? await resolveToolCall(c.env, result.functionCall)
      : contentFromResult(result.text);
  } catch {
    return c.json({ error: 'NCC Bot is unavailable right now — please try again in a moment.' }, 502);
  }

  const messageId = await finishTurn(c.env, user.id, conversationId, modelContent);
  return c.json({ conversationId, messageId, message: toClientSafeContent(modelContent) });
});

/**
 * Streaming counterpart of the route above. Kept as a separate endpoint rather than
 * content-negotiated on `/` so the JSON contract stays byte-for-byte unchanged and
 * the client can fall back to it whenever streaming is unavailable.
 */
chatRoutes.post('/stream', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req
    .json<{ conversationId?: string; message?: string }>()
    .catch(() => ({}) as { conversationId?: string; message?: string });

  const prepared = await prepareTurn(c.env, user, body);
  if (!prepared.ok) return c.json({ error: prepared.error }, prepared.status);
  const { conversationId, isNewConversation, systemPrompt, history } = prepared.turn;

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: 'start',
      data: JSON.stringify({ conversationId, isNewConversation }),
    });

    let accumulated = '';
    let functionCall: FunctionCall | null = null;

    try {
      for await (const event of streamGemini(
        c.env.GEMINI_API_KEY,
        systemPrompt,
        history,
        [...TOOL_DECLARATIONS]
      )) {
        if (event.kind === 'functionCall') {
          functionCall = event.call;
          // Any prose streamed before a tool call was preamble to the card that is
          // about to replace it. Tell the client to clear it so the turn doesn't
          // end up showing a half-sentence above the artifact.
          accumulated = '';
          await stream.writeSSE({ event: 'tool', data: JSON.stringify({ name: event.call.name }) });
        } else {
          accumulated += event.delta;
          await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: event.delta }) });
        }
      }
    } catch {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: 'NCC Bot is unavailable right now — please try again in a moment.' }),
      });
      return;
    }

    let modelContent: ModelContent;
    try {
      modelContent = functionCall
        ? await resolveToolCall(c.env, functionCall)
        : contentFromResult(accumulated || null);
    } catch {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: "That tool didn't come back cleanly — please try asking again." }),
      });
      return;
    }

    const messageId = await finishTurn(c.env, user.id, conversationId, modelContent);
    await stream.writeSSE({
      event: 'done',
      data: JSON.stringify({ conversationId, messageId, message: toClientSafeContent(modelContent) }),
    });
  });
});
