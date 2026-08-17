import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { ModelContent } from '../../types';
import type { ClientMessage } from '../api/client';
import { fromLegacyGraph } from '../lib/legacyGraph';
import { Markdown } from './Markdown';
import { Flashcards } from './Flashcards';
import { PracticeTest } from './PracticeTest';
import { WorkedExample } from './WorkedExample';
import { Diagram } from './Diagram';
import { DataTable } from './DataTable';
import { SummaryCard } from './SummaryCard';
import { StudyPlan } from './StudyPlan';
import { SourceList } from './SourceList';

const NEAR_BOTTOM_THRESHOLD_PX = 96;

// Recharts is heavy and most answers are prose, so charts arrive on demand.
const InteractiveGraph = lazy(() => import('./InteractiveGraph'));

function ChartFallback() {
  return (
    <div className="flex h-64 items-center justify-center rounded-[var(--radius-card)] border border-rule bg-raised">
      <p className="thinking font-mono text-tiny text-pencil">
        loading chart<span>.</span>
        <span>.</span>
        <span>.</span>
      </p>
    </div>
  );
}

/** Human-readable label for the "building a card" state, keyed by tool name. */
const TOOL_LABELS: Record<string, string> = {
  render_worked_example: 'working through a parallel problem',
  render_interactive_graph: 'plotting that',
  render_diagram: 'drawing that',
  render_table: 'building a table',
  render_summary: 'condensing that',
  render_study_plan: 'laying out a plan',
  find_sources: 'searching for real sources',
  render_flashcards: 'making flashcards',
  render_practice_test: 'writing a practice test',
};

export function ModelBody({
  content,
  messageId,
  conversationId,
}: {
  content: ModelContent;
  messageId: string;
  conversationId: string | null;
}) {
  switch (content.type) {
    case 'text':
      return <Markdown>{content.text}</Markdown>;
    case 'composite':
      // The explanation leads, the card follows. A card alone teaches nothing.
      return (
        <div className="space-y-3">
          <Markdown>{content.text}</Markdown>
          <ModelBody content={content.artifact} messageId={messageId} conversationId={conversationId} />
        </div>
      );
    case 'worked_example':
      return <WorkedExample content={content} />;
    case 'interactive_graph':
      return (
        <Suspense fallback={<ChartFallback />}>
          <InteractiveGraph content={content} />
        </Suspense>
      );
    // Conversations created before interactive_graph existed still hold this shape.
    case 'graph':
      return (
        <Suspense fallback={<ChartFallback />}>
          <InteractiveGraph content={fromLegacyGraph(content)} />
        </Suspense>
      );
    case 'diagram':
      return <Diagram content={content} />;
    case 'table':
      return <DataTable content={content} />;
    case 'summary':
      return <SummaryCard content={content} />;
    case 'study_plan':
      return <StudyPlan content={content} messageId={messageId} />;
    case 'sources':
      return <SourceList content={content} />;
    case 'flashcards':
      return <Flashcards cards={content.cards} />;
    case 'practice_test':
      return conversationId ? (
        <PracticeTest conversationId={conversationId} messageId={messageId} questions={content.questions} />
      ) : null;
  }
}

/**
 * The gutter label naming who is speaking — the app's one structural device.
 *
 * Below `md` the label sits above the message instead of beside it: a fixed gutter
 * would eat a fifth of the width on a 320px phone, squeezing equations and tables
 * for the sake of a five-character label.
 */
function Turn({ speaker, children }: { speaker: 'You' | 'NCC Bot'; children: React.ReactNode }) {
  const isUser = speaker === 'You';
  const rule = isUser ? 'border-rule' : 'border-accent/25';

  return (
    <article className="animate-rise md:grid md:grid-cols-[5rem_minmax(0,1fr)] md:gap-x-5">
      <div className="mb-1 md:mb-0 md:pt-0.5 md:text-right">
        <span className={`eyebrow ${isUser ? '' : 'text-accent'}`}>{speaker}</span>
      </div>
      <div className={`min-w-0 border-l pl-3 md:pl-5 ${rule}`}>{children}</div>
    </article>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access denied — say nothing rather than showing a false success.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="hover-reveal font-mono text-micro uppercase tracking-[0.08em] text-pencil hover:text-ink"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function MessageThread({
  messages,
  conversationId,
  streamingText,
  pendingTool,
  isWaiting,
  error,
  onRetry,
}: {
  messages: ClientMessage[];
  conversationId: string | null;
  streamingText?: string;
  pendingTool?: string | null;
  isWaiting?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
  }

  // Reset before the messages effect below runs, so switching conversations always
  // scrolls to the bottom regardless of scroll position in the previous one.
  useEffect(() => {
    isNearBottomRef.current = true;
  }, [conversationId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isNearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, pendingTool, isWaiting]);

  const showThinking = isWaiting && !streamingText && !pendingTool;

  return (
    <div ref={containerRef} onScroll={handleScroll} className="subtle-scroll flex-1 overflow-y-auto">
      {/* The column widens a little past `lg` so charts, tables and diagrams get
          real room on a desktop, while prose stays capped at --measure. */}
      <div className="mx-auto w-full max-w-3xl space-y-7 px-4 py-6 sm:px-5 sm:py-7 lg:max-w-4xl">
        {messages.map((message) =>
          message.role === 'user' ? (
            <Turn key={message.id} speaker="You">
              <div className="whitespace-pre-wrap text-body text-ink">
                {message.content.type === 'text' ? message.content.text : ''}
              </div>
            </Turn>
          ) : (
            <div key={message.id} className="group">
              <Turn speaker="NCC Bot">
                <div style={{ maxWidth: 'var(--measure)' }}>
                  <ModelBody content={message.content} messageId={message.id} conversationId={conversationId} />
                </div>
                {(message.content.type === 'text' || message.content.type === 'composite') && (
                  <div className="mt-2 h-4">
                    <CopyButton text={message.content.text} />
                  </div>
                )}
              </Turn>
            </div>
          )
        )}

        {streamingText !== undefined && streamingText !== '' && (
          <Turn speaker="NCC Bot">
            <div style={{ maxWidth: 'var(--measure)' }}>
              <div className="caret">
                <Markdown>{streamingText}</Markdown>
              </div>
            </div>
          </Turn>
        )}

        {pendingTool && (
          <Turn speaker="NCC Bot">
            <p className="thinking font-mono text-tiny text-pencil" aria-live="polite">
              {TOOL_LABELS[pendingTool] ?? 'putting that together'}
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </p>
          </Turn>
        )}

        {showThinking && (
          <Turn speaker="NCC Bot">
            <p className="thinking font-mono text-tiny text-pencil" aria-live="polite">
              thinking<span>.</span>
              <span>.</span>
              <span>.</span>
            </p>
          </Turn>
        )}

        {error && (
          <Turn speaker="NCC Bot">
            <div className="rounded-md border border-wrong/30 bg-wrong-soft px-3.5 py-2.5">
              <p className="text-base text-ink">{error}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2 font-mono text-micro uppercase tracking-[0.08em] text-accent hover:underline"
                >
                  Try again
                </button>
              )}
            </div>
          </Turn>
        )}
      </div>
    </div>
  );
}
