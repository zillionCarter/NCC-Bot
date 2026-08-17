import type { ReactNode } from 'react';
import { Markdown } from './Markdown';

/**
 * The shared frame every generated artifact sits in.
 *
 * The mono eyebrow naming the artifact type is the app's one structural device: it
 * tells you what you are looking at before you parse the contents, and it is the
 * same grammar whether the card holds a graph, a table or a revision plan.
 */
export function Artifact({
  label,
  title,
  caption,
  actions,
  children,
  className = '',
}: {
  label: string;
  title?: string;
  caption?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={`animate-rise overflow-hidden rounded-[var(--radius-card)] border border-rule bg-raised ${className}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-rule px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <span className="eyebrow">{label}</span>
          {title && (
            <h3 className="mt-0.5 truncate font-display text-body font-semibold leading-snug text-ink">{title}</h3>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>

      <div className="px-3 py-3.5 sm:px-4 sm:py-4">{children}</div>

      {caption && (
        <figcaption className="border-t border-rule bg-sunken px-3 py-2.5 text-small text-graphite sm:px-4">
          <Markdown inline>{caption}</Markdown>
        </figcaption>
      )}
    </figure>
  );
}

/** A small, quiet control for artifact headers and rows. */
export function GhostButton({
  onClick,
  children,
  title,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="rounded px-2 py-1 font-mono text-micro font-medium uppercase tracking-[0.08em] text-pencil transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
