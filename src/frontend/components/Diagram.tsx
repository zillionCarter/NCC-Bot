import { useEffect, useId, useState } from 'react';
import type { ModelContent } from '../../types';
import { Artifact } from './Artifact';

type DiagramContent = Extract<ModelContent, { type: 'diagram' }>;

/**
 * Renders Mermaid source to SVG.
 *
 * Mermaid is around half a megabyte, so it is imported on first use rather than
 * bundled into the initial load — most conversations never contain a diagram.
 */
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

/* Mermaid's own theme, tuned toward the app's tokens: white node fills on the
   raised surface, accent borders, graphite connectors. */
const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict' as const,
  theme: 'base' as const,
  fontFamily: "'Atkinson Hyperlegible Next', system-ui, sans-serif",
  themeVariables: {
    background: '#ffffff',
    primaryColor: '#ffffff',
    primaryTextColor: '#16181d',
    primaryBorderColor: '#0b5fb0',
    secondaryColor: '#e8f0f9',
    tertiaryColor: '#f2f2ef',
    lineColor: '#5a6068',
    textColor: '#16181d',
    fontSize: '14px',
  },
};

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize(MERMAID_CONFIG);
      return mermaid;
    });
  }
  return mermaidPromise;
}

export function Diagram({ content }: { content: DiagramContent }) {
  const reactId = useId();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    // Mermaid ids must be valid CSS selectors; React's useId contains colons.
    const renderId = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;

    loadMermaid()
      .then((mermaid) => mermaid.render(renderId, content.mermaid))
      .then(({ svg: rendered }) => {
        if (!cancelled) setSvg(rendered);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [content.mermaid, reactId]);

  return (
    <Artifact label={`${content.kind} diagram`} title={content.title} caption={content.caption}>
      {failed ? (
        <div>
          <p className="text-small text-graphite">
            This diagram didn&apos;t draw — the shape it described isn&apos;t valid. The source is below if you want to
            read it, or ask for it again.
          </p>
          <pre className="subtle-scroll mt-3 overflow-x-auto rounded-md border border-rule bg-sunken p-3 font-mono text-tiny text-graphite">
            {content.mermaid}
          </pre>
        </div>
      ) : svg ? (
        <div
          className="subtle-scroll overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          // Mermaid output, generated in `strict` security mode which strips
          // scripts and inline handlers from the diagram source.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="flex h-32 items-center justify-center">
          <p className="thinking font-mono text-tiny text-pencil">
            drawing<span>.</span>
            <span>.</span>
            <span>.</span>
          </p>
        </div>
      )}
    </Artifact>
  );
}
