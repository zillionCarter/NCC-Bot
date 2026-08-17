import type { ModelContent } from '../../types';
import { Markdown } from './Markdown';
import { Artifact } from './Artifact';

type SourcesContent = Extract<ModelContent, { type: 'sources' }>;

/**
 * Every item here came from Google Search grounding metadata, not from model prose
 * — see src/sources/finder.ts. That is the reason these links can be trusted enough
 * to put in front of a student who is about to cite them.
 */
export function SourceList({ content }: { content: SourcesContent }) {
  return (
    <Artifact label="Sources" title={content.topic}>
      {content.note && (
        <div className="mb-4 border-l-2 border-accent pl-3 text-base text-graphite">
          <Markdown inline>{content.note}</Markdown>
        </div>
      )}

      <ol className="space-y-2.5">
        {content.items.map((item, index) => (
          <li key={item.url}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex gap-3 rounded-md border border-rule bg-raised px-3 py-2.5 transition-colors hover:border-rule-strong hover:bg-sunken"
            >
              <span
                aria-hidden
                className="mt-0.5 font-mono text-micro text-pencil"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink group-hover:text-accent">{item.title}</span>
                <span className="mt-0.5 block font-mono text-tiny text-pencil">{item.domain}</span>
                {item.why && <span className="mt-1 block text-small text-graphite">{item.why}</span>}
              </span>
              <span aria-hidden className="mt-0.5 text-pencil transition-colors group-hover:text-accent">
                ↗
              </span>
            </a>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-small text-graphite">
        Read before you cite — check who wrote it and when. Your teacher will want the author, title and date, not just
        a link.
      </p>

      {content.search_entry_point && (
        <div className="mt-4 border-t border-rule pt-3">
          {/* Google's Search Suggestions markup. Grounding's terms require showing
              it alongside a grounded answer. It is third-party HTML, so it renders
              inside a sandboxed iframe with no script execution and no access to
              this page, rather than being injected into our own DOM. */}
          <iframe
            title="Related Google searches"
            sandbox=""
            srcDoc={content.search_entry_point}
            className="h-[76px] w-full border-0"
          />
        </div>
      )}
    </Artifact>
  );
}
