import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../src/gemini/systemPrompt';

describe('buildSystemPrompt', () => {
  it('includes the Socratic policy for students', () => {
    const prompt = buildSystemPrompt({ role: 'student', name: 'Alex', gradeOrSubject: 'Year 10', memorySummary: '' });
    expect(prompt).toMatch(/never give the direct answer/i);
    expect(prompt).toMatch(/related.{0,20}different problem/i);
    expect(prompt).toMatch(/Alex/);
  });

  it('tells staff to answer directly and skips the Socratic constraint', () => {
    const prompt = buildSystemPrompt({ role: 'teacher', name: 'Ms Lee', gradeOrSubject: 'Maths', memorySummary: '' });
    expect(prompt).toMatch(/answer directly/i);
    expect(prompt).not.toMatch(/never give the direct answer/i);
  });

  it('includes the memory summary when present', () => {
    const prompt = buildSystemPrompt({
      role: 'student',
      name: 'Sam',
      gradeOrSubject: 'Year 9',
      memorySummary: 'Struggles with fractions.',
    });
    expect(prompt).toMatch(/Struggles with fractions\./);
  });
});
