import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('renders bold as styling instead of literal asterisks', () => {
    // This is the whole bug report: model text used to arrive as pre-wrapped plain
    // text, so every ** showed up on screen.
    const { container } = render(<Markdown>{'This is **important** text'}</Markdown>);
    expect(container.querySelector('strong')?.textContent).toBe('important');
    expect(container.textContent).not.toContain('**');
  });

  it('renders headings, lists and links properly', () => {
    const { container } = render(
      <Markdown>{'## Section\n\n- one\n- two\n\n[link](https://example.test)'}</Markdown>
    );
    expect(container.querySelector('h2')?.textContent).toBe('Section');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    const link = container.querySelector('a');
    expect(link).toHaveAttribute('href', 'https://example.test');
    // target="_blank" without rel leaks window.opener.
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('typesets inline and display maths with KaTeX', () => {
    // Display maths needs its delimiters on their own lines — see asMath.
    const { container } = render(<Markdown>{'Inline $x^2$ here.\n\n$$\n\\frac{1}{2}\n$$'}</Markdown>);
    expect(container.querySelectorAll('.katex').length).toBeGreaterThan(1);
    expect(container.querySelector('.katex-display')).toBeTruthy();
  });

  it('typesets the bracket delimiters the model also emits', () => {
    const { container } = render(<Markdown>{'The term \\(a^2\\) matters'}</Markdown>);
    expect(container.querySelector('.katex')).toBeTruthy();
    expect(container.textContent).not.toContain('\\(');
  });

  it('keeps currency literal rather than eating the rest of the line', () => {
    render(<Markdown>{'The ticket costs $5 in total.'}</Markdown>);
    expect(screen.getByText(/costs \$5 in total/)).toBeInTheDocument();
  });

  it('renders a malformed equation in place instead of blanking the answer', () => {
    const { container } = render(<Markdown>{'Text before $\\frac{$ text after'}</Markdown>);
    // The surrounding prose is usually still useful, so a bad equation must not
    // take the whole message down.
    expect(container.textContent).toContain('Text before');
    expect(container.textContent).toContain('text after');
  });

  it('renders GFM tables inside a scroll container', () => {
    const { container } = render(<Markdown>{'| A | B |\n| - | - |\n| 1 | 2 |'}</Markdown>);
    expect(container.querySelector('.table-scroll table')).toBeTruthy();
    expect(container.querySelectorAll('tbody td')).toHaveLength(2);
  });

  it('highlights a fenced code block in a language it knows', () => {
    const { container } = render(<Markdown>{'```python\nprint("hi")\n```'}</Markdown>);
    const code = container.querySelector('pre code');
    expect(code?.className).toContain('hljs');
    expect(code?.querySelector('.hljs-string')).toBeTruthy();
  });

  it('leaves an unlabelled code block as plain text rather than guessing', () => {
    const { container } = render(<Markdown>{'```\nsome text\n```'}</Markdown>);
    const code = container.querySelector('pre code');
    expect(code?.textContent).toContain('some text');
    expect(code?.className ?? '').not.toContain('hljs');
  });

  it('does not render raw HTML from model output', () => {
    // No rehype-raw: model text must never become live markup.
    const { container } = render(<Markdown>{'<img src=x onerror="alert(1)"> plain'}</Markdown>);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('plain');
  });

  it('omits the wrapping paragraph in inline mode', () => {
    const { container } = render(<Markdown inline>{'just text'}</Markdown>);
    expect(container.querySelector('p')).toBeNull();
    expect(container.textContent).toBe('just text');
  });
});
