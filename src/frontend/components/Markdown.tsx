import { memo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { rehypeHighlightLite } from '../lib/rehypeHighlightLite';
import { normalizeMarkdown } from '../lib/normalizeMarkdown';

/**
 * The single rendering path for model-authored text anywhere in the app — chat
 * answers, worked-example explanations, summaries, table cells, quiz prompts.
 * Routing everything through one component is what keeps maths and formatting
 * identical across surfaces.
 *
 * Raw HTML is deliberately not enabled (no rehype-raw): the input is model output,
 * so allowing HTML through would hand it an injection surface for nothing.
 */

const PLUGINS = {
  remark: [remarkGfm, remarkMath],
  rehype: [
    // `throwOnError: false` keeps a single malformed equation from blanking the
    // whole answer — it renders in place as flagged text instead.
    [rehypeKatex, { throwOnError: false, errorColor: 'currentColor', strict: false }] as const,
    rehypeHighlightLite,
  ],
};

export const Markdown = memo(function Markdown({
  children,
  className = '',
  inline = false,
}: {
  children: string;
  className?: string;
  inline?: boolean;
}) {
  const source = normalizeMarkdown(children);
  // Inline mode wraps in a span, not a div: these render inside paragraphs, table
  // cells, labels and definition lists, where a block-level wrapper both breaks the
  // surrounding layout and stops inline backgrounds (the highlighter) from painting.
  const Wrapper = inline ? 'span' : 'div';

  return (
    <Wrapper className={`prose ${inline ? 'prose-inline' : ''} ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={PLUGINS.remark}
        rehypePlugins={PLUGINS.rehype as never}
        components={{
          // External links open away from the app, and rel is set because
          // target="_blank" without it leaks window.opener.
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {linkChildren}
            </a>
          ),
          // A wide table scrolls within its own box rather than widening the page.
          table: ({ children: tableChildren }) => (
            <div className="table-scroll subtle-scroll">
              <table>{tableChildren}</table>
            </div>
          ),
          // In inline contexts (a table cell, a step line) a <p> would add block
          // spacing that breaks the layout around it.
          p: ({ children: paragraphChildren }) =>
            inline ? <>{paragraphChildren as ReactNode}</> : <p>{paragraphChildren}</p>,
        }}
      >
        {source}
      </ReactMarkdown>
    </Wrapper>
  );
});
