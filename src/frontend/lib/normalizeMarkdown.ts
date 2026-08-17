/**
 * Reconciles what the model actually writes with what remark-math can read.
 *
 * Two things need fixing before rendering:
 *
 * 1. Gemini emits LaTeX delimiters in all three common forms — `$...$`, `\(...\)`
 *    and `\[...\]`. Only the dollar form is recognised, so the others would render
 *    as literal backslashes and brackets.
 * 2. A single stray `$` on a line is nearly always currency ("it costs $5"), and
 *    remark-math would swallow it and everything after it looking for a partner.
 *
 * Both transforms skip fenced and inline code, where a backslash or dollar sign is
 * content rather than notation.
 */

const FENCE = /^\s*(```|~~~)/;

function convertDelimiters(line: string): string {
  return line
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, body: string) => `$$${body}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, body: string) => `$${body}$`);
}

/**
 * A line carrying exactly one dollar sign cannot be a matched pair, so it is a
 * literal. Lines with two or more are left alone — those are real notation.
 */
function escapeLoneDollar(line: string): string {
  const dollars = line.match(/(?<!\\)\$/g);
  if (!dollars || dollars.length !== 1) return line;
  return line.replace(/(?<!\\)\$/, '\\$');
}

/** Splits a line on inline-code spans so only the prose parts are transformed. */
function mapOutsideInlineCode(line: string, transform: (segment: string) => string): string {
  return line
    .split(/(`+[^`]*`+)/g)
    .map((segment) => (segment.startsWith('`') ? segment : transform(segment)))
    .join('');
}

export function normalizeMarkdown(input: string): string {
  if (!input) return '';

  let inFence = false;

  return input
    .split('\n')
    .map((line) => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return mapOutsideInlineCode(line, (segment) => escapeLoneDollar(convertDelimiters(segment)));
    })
    .join('\n');
}

/**
 * Wraps a bare LaTeX fragment from a tool argument as display or inline math.
 *
 * Display maths gets its delimiters on their own lines, because remark-math reads
 * a single-line `$$x$$` as *inline* — which silently produces cramped, mid-sentence
 * equations where a centred one was intended.
 *
 * Existing delimiters are stripped first: tool fields are specified as bare LaTeX,
 * but models add delimiters anyway, and a second pair renders as literal dollars.
 */
export function asMath(latex: string | undefined, display = false): string {
  let body = latex?.trim();
  if (!body) return '';

  if (/^\$\$[\s\S]*\$\$$/.test(body)) body = body.slice(2, -2).trim();
  else if (/^\$[\s\S]*\$$/.test(body)) body = body.slice(1, -1).trim();
  if (!body) return '';

  return display ? `$$\n${body}\n$$` : `$${body}$`;
}
