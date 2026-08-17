import { createLowlight } from 'lowlight';
import { visit } from 'unist-util-visit';
import { toText } from 'hast-util-to-text';
import type { Element, Root } from 'hast';
import { HIGHLIGHT_LANGUAGES } from './highlightLanguages';

/**
 * Syntax highlighting for fenced code blocks.
 *
 * This exists instead of `rehype-highlight` because that package statically imports
 * lowlight's `common` set, so every one of its ~35 grammars lands in the bundle no
 * matter which languages you register. Building the lowlight instance here means
 * only the grammars in HIGHLIGHT_LANGUAGES are ever pulled in.
 */
const lowlight = createLowlight(HIGHLIGHT_LANGUAGES);

function languageOf(node: Element): string | undefined {
  const className = node.properties?.className;
  if (!Array.isArray(className)) return undefined;
  for (const entry of className) {
    const name = String(entry);
    if (name.startsWith('language-')) return name.slice('language-'.length).toLowerCase();
  }
  return undefined;
}

export function rehypeHighlightLite() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, _index, parent) => {
      // Only fenced blocks, never inline `code` spans.
      if (node.tagName !== 'code') return;
      if (!parent || parent.type !== 'element' || parent.tagName !== 'pre') return;

      const language = languageOf(node);
      // An unlabelled or unknown language renders as plain text rather than being
      // guessed at — a wrong guess colours the code misleadingly.
      if (!language || !lowlight.registered(language)) return;

      const source = toText(node, { whitespace: 'pre' });
      if (!source.trim()) return;

      try {
        const highlighted = lowlight.highlight(language, source);
        node.children = highlighted.children as Element['children'];
        const existing = Array.isArray(node.properties.className) ? node.properties.className : [];
        node.properties.className = [...existing, 'hljs'];
      } catch {
        // Leave the block as plain text — unhighlighted code still reads fine.
      }
    });
  };
}
