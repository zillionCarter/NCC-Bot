import { describe, it, expect } from 'vitest';
import {
  functionCallToContent,
  modelContentToText,
  toClientSafeContent,
  sourcesContent,
  TOOL_DECLARATIONS,
} from '../src/gemini/tools';
import type { ModelContent } from '../src/types';

describe('TOOL_DECLARATIONS', () => {
  it('declares every renderable skill', () => {
    const names = TOOL_DECLARATIONS.map((t) => t.name);
    expect(names).toEqual([
      'render_worked_example',
      'render_interactive_graph',
      'render_diagram',
      'render_table',
      'render_summary',
      'render_study_plan',
      'find_sources',
      'render_flashcards',
      'render_practice_test',
    ]);
  });

  it('makes the parallel problem and what changed mandatory on worked examples', () => {
    const declaration = TOOL_DECLARATIONS.find((t) => t.name === 'render_worked_example');
    expect(declaration?.parameters.required).toContain('parallel_problem');
    // Requiring `what_changed` is what forces an actual substitution rather than a
    // restatement of the student's own problem.
    expect(declaration?.parameters.required).toContain('what_changed');
  });
});

describe('functionCallToContent', () => {
  it('maps render_worked_example, keeping their problem separate from the solved one', () => {
    const content = functionCallToContent({
      name: 'render_worked_example',
      args: {
        original_restated: 'Solve 3x + 7 = 22',
        parallel_problem: 'Solve 5x + 4 = 29',
        what_changed: 'coefficient 3 became 5, constant 7 became 4',
        steps: [{ latex: '5x = 25', explanation: 'Subtract 4 from both sides.' }],
        final_answer: 'x = 5',
        your_turn: 'Now subtract 7 from both sides of yours.',
      },
    });
    expect(content).toEqual({
      type: 'worked_example',
      title: undefined,
      original_restated: 'Solve 3x + 7 = 22',
      parallel_problem: 'Solve 5x + 4 = 29',
      what_changed: 'coefficient 3 became 5, constant 7 became 4',
      steps: [{ latex: '5x = 25', explanation: 'Subtract 4 from both sides.' }],
      final_answer: 'x = 5',
      your_turn: 'Now subtract 7 from both sides of yours.',
    });
  });

  it('tolerates a worked example whose steps omit latex', () => {
    const content = functionCallToContent({
      name: 'render_worked_example',
      args: {
        original_restated: 'a',
        parallel_problem: 'b',
        what_changed: 'c',
        steps: [{ explanation: 'Reason it out.' }],
        final_answer: 'd',
        your_turn: 'e',
      },
    });
    if (content.type !== 'worked_example') throw new Error('expected worked_example');
    expect(content.steps[0]).toEqual({ latex: undefined, explanation: 'Reason it out.' });
  });

  it('maps render_interactive_graph in function mode with slider params', () => {
    const content = functionCallToContent({
      name: 'render_interactive_graph',
      args: {
        mode: 'function',
        expressions: ['a*x^2 + b*x + c'],
        params: [{ name: 'a', value: 1, min: -5, max: 5, step: 0.1 }],
        xMin: -10,
        xMax: 10,
        title: 'Quadratics',
      },
    });
    if (content.type !== 'interactive_graph') throw new Error('expected interactive_graph');
    expect(content.mode).toBe('function');
    expect(content.expressions).toEqual(['a*x^2 + b*x + c']);
    expect(content.params).toEqual([{ name: 'a', value: 1, min: -5, max: 5, step: 0.1 }]);
  });

  it('defaults an unrecognised graph mode to series and fills missing param bounds', () => {
    const content = functionCallToContent({
      name: 'render_interactive_graph',
      args: { mode: 'nonsense', params: [{ name: 'k' }] },
    });
    if (content.type !== 'interactive_graph') throw new Error('expected interactive_graph');
    expect(content.mode).toBe('series');
    expect(content.params).toEqual([{ name: 'k', value: 1, min: -10, max: 10, step: undefined }]);
  });

  it('maps render_diagram, render_table, render_summary and render_study_plan', () => {
    expect(
      functionCallToContent({ name: 'render_diagram', args: { kind: 'flowchart', mermaid: 'flowchart TD\nA-->B' } })
    ).toEqual({ type: 'diagram', kind: 'flowchart', mermaid: 'flowchart TD\nA-->B', title: undefined, caption: undefined });

    expect(
      functionCallToContent({ name: 'render_table', args: { columns: ['A', 'B'], rows: [['1', '2']] } })
    ).toEqual({ type: 'table', columns: ['A', 'B'], rows: [['1', '2']], title: undefined, caption: undefined });

    const summary = functionCallToContent({
      name: 'render_summary',
      args: { tldr: 'Short.', key_points: ['one'], key_terms: [{ term: 'osmosis', definition: 'water moves' }] },
    });
    if (summary.type !== 'summary') throw new Error('expected summary');
    expect(summary.key_terms).toEqual([{ term: 'osmosis', definition: 'water moves' }]);

    const plan = functionCallToContent({
      name: 'render_study_plan',
      args: { sessions: [{ label: 'Monday', focus: 'Algebra', tasks: ['Ex 4A'], minutes: 45 }] },
    });
    if (plan.type !== 'study_plan') throw new Error('expected study_plan');
    expect(plan.sessions[0]).toEqual({
      label: 'Monday',
      date: undefined,
      focus: 'Algebra',
      minutes: 45,
      tasks: ['Ex 4A'],
    });
  });

  it('still maps the legacy render_graph shape stored in older conversations', () => {
    const content = functionCallToContent({
      name: 'render_graph',
      args: { chartType: 'line', data: [1, 2, 3], labels: ['a', 'b', 'c'], title: 'Growth' },
    });
    expect(content).toEqual({ type: 'graph', chartType: 'line', data: [1, 2, 3], labels: ['a', 'b', 'c'], title: 'Growth' });
  });

  it('maps render_flashcards and render_practice_test', () => {
    expect(functionCallToContent({ name: 'render_flashcards', args: { cards: [{ front: 'Q', back: 'A' }] } })).toEqual({
      type: 'flashcards',
      cards: [{ front: 'Q', back: 'A' }],
    });
    const args = { questions: [{ prompt: 'What is 2+2?', correct_answer: '4', explanation: 'Addition.' }] };
    expect(functionCallToContent({ name: 'render_practice_test', args })).toEqual({
      type: 'practice_test',
      questions: args.questions,
    });
  });

  it('throws on an unknown tool name', () => {
    expect(() => functionCallToContent({ name: 'nope', args: {} })).toThrow(/unknown tool/i);
  });
});

describe('modelContentToText', () => {
  it('passes plain text through', () => {
    expect(modelContentToText({ type: 'text', text: 'Hi there' })).toBe('Hi there');
  });

  it('records which problem was solved so the model can refer back to its method', () => {
    const text = modelContentToText({
      type: 'worked_example',
      original_restated: 'Solve 3x + 7 = 22',
      parallel_problem: 'Solve 5x + 4 = 29',
      what_changed: 'numbers',
      steps: [],
      final_answer: 'x = 5',
      your_turn: 'go',
    });
    expect(text).toMatch(/Solve 3x \+ 7 = 22/);
    expect(text).toMatch(/Solve 5x \+ 4 = 29/);
    expect(text).toMatch(/x = 5/);
  });

  it('summarizes every other content type compactly', () => {
    const cases: [ModelContent, RegExp][] = [
      [{ type: 'flashcards', cards: [{ front: 'a', back: 'b' }] }, /1 flashcard/],
      [
        { type: 'practice_test', questions: [{ prompt: 'p', correct_answer: 'a', explanation: 'e' }] },
        /1-question practice test/,
      ],
      [{ type: 'graph', chartType: 'bar', data: [], title: 'Sales' }, /graph.*Sales/i],
      [{ type: 'interactive_graph', mode: 'function', title: 'Parabola' }, /interactive function graph.*Parabola/i],
      [{ type: 'diagram', kind: 'mindmap', mermaid: 'x', title: 'Cells' }, /mindmap diagram.*Cells/i],
      [{ type: 'table', columns: ['a'], rows: [['1'], ['2']] }, /table.*2 rows/i],
      [{ type: 'summary', tldr: 'It is short.', key_points: [], key_terms: [] }, /It is short\./],
      [{ type: 'study_plan', sessions: [{ label: 'Mon', focus: 'f', tasks: [] }] }, /1 sessions/],
      [
        { type: 'sources', topic: 'Macbeth', items: [{ title: 'T', url: 'https://x.test', domain: 'x.test' }] },
        /Macbeth.*x\.test/,
      ],
    ];
    for (const [content, pattern] of cases) {
      expect(modelContentToText(content), JSON.stringify(content.type)).toMatch(pattern);
    }
  });
});

describe('toClientSafeContent', () => {
  it('redacts correct_answer and explanation on practice tests', () => {
    const safe = toClientSafeContent({
      type: 'practice_test',
      questions: [{ prompt: 'p', choices: ['a', 'b'], correct_answer: 'a', explanation: 'because' }],
    });
    expect(safe).toEqual({
      type: 'practice_test',
      questions: [{ prompt: 'p', choices: ['a', 'b'], correct_answer: '', explanation: '' }],
    });
  });

  it('leaves a worked example fully intact — its answer is to the parallel problem, not theirs', () => {
    const content: ModelContent = {
      type: 'worked_example',
      original_restated: 'Solve 3x + 7 = 22',
      parallel_problem: 'Solve 5x + 4 = 29',
      what_changed: 'numbers',
      steps: [{ latex: '5x = 25', explanation: 'Subtract.' }],
      final_answer: 'x = 5',
      your_turn: 'go',
    };
    expect(toClientSafeContent(content)).toEqual(content);
  });

  it('passes other content types through unchanged', () => {
    const text = { type: 'text' as const, text: 'hi' };
    expect(toClientSafeContent(text)).toEqual(text);
  });
});

describe('sourcesContent', () => {
  it('carries the note, queries and search entry point alongside the items', () => {
    const content = sourcesContent('Macbeth', [{ title: 'T', url: 'https://x.test', domain: 'x.test' }], {
      note: 'Start with the first one.',
      searchQueries: ['macbeth ambition'],
      searchEntryPoint: '<div>suggestions</div>',
    });
    expect(content).toEqual({
      type: 'sources',
      topic: 'Macbeth',
      items: [{ title: 'T', url: 'https://x.test', domain: 'x.test' }],
      note: 'Start with the first one.',
      search_queries: ['macbeth ambition'],
      search_entry_point: '<div>suggestions</div>',
    });
  });
});
