import { describe, it, expect } from 'vitest';
import { normalizeMarkdown, asMath } from './normalizeMarkdown';

describe('normalizeMarkdown', () => {
  it('converts the bracket delimiters Gemini emits into the dollar form', () => {
    expect(normalizeMarkdown('The value \\(x^2\\) grows.')).toBe('The value $x^2$ grows.');
    expect(normalizeMarkdown('\\[a^2 + b^2 = c^2\\]')).toBe('$$a^2 + b^2 = c^2$$');
  });

  it('leaves already-correct dollar maths alone', () => {
    expect(normalizeMarkdown('Solve $3x + 7 = 22$ now.')).toBe('Solve $3x + 7 = 22$ now.');
    expect(normalizeMarkdown('$$x = 5$$')).toBe('$$x = 5$$');
  });

  it('escapes a lone dollar, which is currency rather than maths', () => {
    // Unescaped, remark-math would swallow everything after it hunting for a pair.
    expect(normalizeMarkdown('It costs $5 to enter.')).toBe('It costs \\$5 to enter.');
  });

  it('does not touch a matched pair on the same line', () => {
    expect(normalizeMarkdown('Both $x$ and more text')).toBe('Both $x$ and more text');
  });

  it('leaves code fences untouched', () => {
    const input = ['Before $5 here', '```python', 'cost = "$5"', 'path = "\\(raw\\)"', '```', 'After $9 here'].join('\n');
    const output = normalizeMarkdown(input);
    expect(output).toContain('cost = "$5"');
    expect(output).toContain('path = "\\(raw\\)"');
    // Prose either side of the fence is still normalized.
    expect(output).toContain('Before \\$5 here');
    expect(output).toContain('After \\$9 here');
  });

  it('leaves inline code untouched', () => {
    expect(normalizeMarkdown('Run `echo $HOME` now')).toBe('Run `echo $HOME` now');
  });

  it('handles empty input', () => {
    expect(normalizeMarkdown('')).toBe('');
  });

  it('preserves multi-line display maths', () => {
    const input = '$$\nx = 5\n$$';
    expect(normalizeMarkdown(input)).toBe(input);
  });
});

describe('asMath', () => {
  it('wraps bare LaTeX inline', () => {
    expect(asMath('x^2')).toBe('$x^2$');
  });

  it('puts display delimiters on their own lines, or remark-math reads it as inline', () => {
    expect(asMath('x^2', true)).toBe('$$\nx^2\n$$');
  });

  it('does not double-wrap when the model already added delimiters', () => {
    expect(asMath('$x^2$')).toBe('$x^2$');
    expect(asMath('$$x^2$$', true)).toBe('$$\nx^2\n$$');
    // A model that supplies inline delimiters for a field rendered as display
    // still gets display treatment.
    expect(asMath('$x^2$', true)).toBe('$$\nx^2\n$$');
  });

  it('returns nothing for delimiters wrapped around nothing', () => {
    expect(asMath('$$  $$', true)).toBe('');
  });

  it('returns an empty string for nothing, rather than empty delimiters', () => {
    expect(asMath(undefined)).toBe('');
    expect(asMath('   ')).toBe('');
  });
});
