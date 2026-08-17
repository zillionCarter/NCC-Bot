import { useEffect, useState } from 'react';
import type { ModelContent } from '../../types';
import { Markdown } from './Markdown';
import { Artifact, GhostButton } from './Artifact';

type StudyPlanContent = Extract<ModelContent, { type: 'study_plan' }>;

const STORAGE_PREFIX = 'ncc-bot-plan:';

/**
 * Tick state is kept in localStorage rather than the database.
 *
 * That makes it per-device, which is a real limitation given the app is otherwise
 * portable across devices — but a checkbox on a revision plan is low-stakes, and
 * this avoids a schema migration and a write endpoint for it. Worth revisiting if
 * students start relying on it.
 */
function readProgress(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function formatDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function StudyPlan({ content, messageId }: { content: StudyPlanContent; messageId: string }) {
  const [done, setDone] = useState<Set<string>>(() => readProgress(messageId));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + messageId, JSON.stringify([...done]));
    } catch {
      // Private browsing or a full quota — the plan still works, it just won't persist.
    }
  }, [done, messageId]);

  const allTasks = content.sessions.flatMap((session, sessionIndex) =>
    session.tasks.map((_, taskIndex) => `${sessionIndex}:${taskIndex}`)
  );
  const completed = allTasks.filter((id) => done.has(id)).length;

  function toggle(id: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalMinutes = content.sessions.reduce((sum, session) => sum + (session.minutes ?? 0), 0);

  return (
    <Artifact
      label="Revision plan"
      title={content.title}
      actions={completed > 0 ? <GhostButton onClick={() => setDone(new Set())}>Clear ticks</GhostButton> : undefined}
    >
      {allTasks.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between font-mono text-micro uppercase tracking-[0.08em] text-pencil">
            <span>
              {completed} of {allTasks.length} done
            </span>
            {totalMinutes > 0 && <span>{totalMinutes} min total</span>}
          </div>
          <div
            className="mt-1.5 h-1 overflow-hidden rounded-full bg-rule"
            role="progressbar"
            aria-valuenow={completed}
            aria-valuemin={0}
            aria-valuemax={allTasks.length}
            aria-label="Plan progress"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${allTasks.length ? (completed / allTasks.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <ol className="space-y-4">
        {content.sessions.map((session, sessionIndex) => {
          const dateLabel = session.date ? formatDate(session.date) : null;
          return (
            <li key={sessionIndex} className="border-l-2 border-rule pl-3.5">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <h4 className="font-display text-body font-semibold text-ink">{session.label}</h4>
                {dateLabel && <span className="font-mono text-tiny text-pencil">{dateLabel}</span>}
                {session.minutes ? <span className="font-mono text-tiny text-pencil">{session.minutes} min</span> : null}
              </div>

              {session.focus && (
                <div className="mt-0.5 text-base text-graphite">
                  <Markdown inline>{session.focus}</Markdown>
                </div>
              )}

              {session.tasks.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {session.tasks.map((task, taskIndex) => {
                    const id = `${sessionIndex}:${taskIndex}`;
                    const checked = done.has(id);
                    return (
                      <li key={taskIndex}>
                        <label className="flex cursor-pointer items-start gap-2.5 text-base">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(id)}
                            className="mt-[0.3em] size-3.5 shrink-0 accent-accent"
                          />
                          <span className={checked ? 'text-pencil line-through' : 'text-ink'}>
                            <Markdown inline>{task}</Markdown>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </Artifact>
  );
}
