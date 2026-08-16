import { describe, it, expect } from 'vitest';
import { functionCallToContent, modelContentToText, TOOL_DECLARATIONS } from '../src/gemini/tools';

describe('TOOL_DECLARATIONS', () => {
  it('declares all three rich-content tools', () => {
    const names = TOOL_DECLARATIONS.map((t) => t.name);
    expect(names).toEqual(['render_flashcards', 'render_practice_test', 'render_graph']);
  });
});

describe('functionCallToContent', () => {
  it('maps render_flashcards', () => {
    const content = functionCallToContent({ name: 'render_flashcards', args: { cards: [{ front: 'Q', back: 'A' }] } });
    expect(content).toEqual({ type: 'flashcards', cards: [{ front: 'Q', back: 'A' }] });
  });

  it('maps render_practice_test', () => {
    const args = { questions: [{ prompt: 'What is 2+2?', correct_answer: '4', explanation: 'Addition.' }] };
    const content = functionCallToContent({ name: 'render_practice_test', args });
    expect(content).toEqual({ type: 'practice_test', questions: args.questions });
  });

  it('maps render_graph', () => {
    const args = { chartType: 'line', data: [1, 2, 3], labels: ['a', 'b', 'c'], title: 'Growth' };
    const content = functionCallToContent({ name: 'render_graph', args });
    expect(content).toEqual({ type: 'graph', ...args });
  });

  it('throws on an unknown tool name', () => {
    expect(() => functionCallToContent({ name: 'nope', args: {} })).toThrow(/unknown tool/i);
  });
});

describe('modelContentToText', () => {
  it('passes plain text through', () => {
    expect(modelContentToText({ type: 'text', text: 'Hi there' })).toBe('Hi there');
  });

  it('summarizes rich content compactly for conversation history', () => {
    expect(modelContentToText({ type: 'flashcards', cards: [{ front: 'a', back: 'b' }] })).toMatch(/1 flashcard/);
    expect(
      modelContentToText({
        type: 'practice_test',
        questions: [{ prompt: 'p', correct_answer: 'a', explanation: 'e' }],
      })
    ).toMatch(/1-question practice test/);
    expect(modelContentToText({ type: 'graph', chartType: 'bar', data: [], title: 'Sales' })).toMatch(/graph.*Sales/i);
  });
});
