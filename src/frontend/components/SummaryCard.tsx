import type { ModelContent } from '../../types';
import { Markdown } from './Markdown';
import { Artifact } from './Artifact';

type SummaryContent = Extract<ModelContent, { type: 'summary' }>;

export function SummaryCard({ content }: { content: SummaryContent }) {
  return (
    <Artifact label="Summary" title={content.title}>
      {content.tldr && (
        <div className="border-l-2 border-accent pl-3">
          <p className="eyebrow">In short</p>
          <div className="mt-1 font-display text-lead leading-snug text-ink">
            <Markdown inline>{content.tldr}</Markdown>
          </div>
        </div>
      )}

      {content.key_points.length > 0 && (
        <section className="mt-5">
          <p className="eyebrow">Key points</p>
          <ul className="mt-2 space-y-2">
            {content.key_points.map((point, index) => (
              <li key={index} className="flex gap-2.5 text-base">
                <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-accent" />
                <div className="min-w-0 flex-1">
                  <Markdown inline>{point}</Markdown>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.key_terms.length > 0 && (
        <section className="mt-5 border-t border-rule pt-4">
          <p className="eyebrow">Terms to know</p>
          <dl className="mt-2 space-y-2.5">
            {content.key_terms.map((entry, index) => (
              <div key={index} className="sm:flex sm:gap-3">
                <dt className="font-semibold text-ink sm:w-40 sm:shrink-0">
                  <Markdown inline>{entry.term}</Markdown>
                </dt>
                <dd className="text-graphite">
                  <Markdown inline>{entry.definition}</Markdown>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </Artifact>
  );
}
