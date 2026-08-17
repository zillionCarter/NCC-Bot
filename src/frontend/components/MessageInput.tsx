import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';

const MAX_ROWS_HEIGHT_PX = 208;

export function MessageInput({
  value,
  onChange,
  onSend,
  onStop,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  busy: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the content up to a ceiling, then scroll inside — a composer that
  // grows without limit eventually pushes the conversation off screen.
  //
  // `field-sizing: content` (see .autogrow in theme.css) does this in CSS, with
  // max-height doing the capping. The JS below is only for browsers without it:
  // measuring scrollHeight is unreliable here, since a reflow between the write
  // and the read can hand back a figure for the wrong layout — which pinned the
  // composer open at its maximum height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')) return;

    const frame = requestAnimationFrame(() => {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_HEIGHT_PX)}px`;
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  function submit() {
    if (!value.trim() || busy) return;
    onSend();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-rule bg-paper">
      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl px-5 pb-3 pt-3">
        <div className="flex items-end gap-2 rounded-[var(--radius-card)] border border-rule bg-raised px-3 py-2 transition-colors focus-within:border-rule-strong">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question, or paste something you're stuck on"
            rows={1}
            aria-label="Message"
            className="autogrow max-h-52 min-h-9 flex-1 resize-none bg-transparent py-1 text-body text-ink placeholder:text-pencil focus:outline-none"
          />

          {busy && onStop ? (
            <button
              type="button"
              onClick={onStop}
              className="mb-0.5 shrink-0 rounded-md border border-rule-strong px-3 py-1.5 text-small font-medium text-ink transition-colors hover:bg-sunken"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={busy || !value.trim()}
              className="mb-0.5 shrink-0 rounded-md bg-accent px-3.5 py-1.5 text-small font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Send
            </button>
          )}
        </div>

        <p className="mt-1.5 flex items-center justify-between text-micro text-pencil">
          <span>
            <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift</kbd>+
            <kbd className="font-mono">Enter</kbd> for a new line
          </span>
          <span className="hidden sm:inline">NCC Bot can be wrong — check what matters</span>
        </p>
      </form>
    </div>
  );
}
