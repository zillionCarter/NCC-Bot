import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkedExample } from './WorkedExample';
import type { ModelContent } from '../../types';

const content: Extract<ModelContent, { type: 'worked_example' }> = {
  type: 'worked_example',
  title: 'Solving linear equations',
  original_restated: 'Solve $3x + 7 = 22$',
  parallel_problem: 'Solve $5x + 4 = 29$',
  what_changed: 'coefficient 3 became 5, constant 7 became 4',
  steps: [
    { latex: '5x = 25', explanation: 'Subtract 4 from both sides.' },
    { latex: 'x = 5', explanation: 'Divide both sides by 5.' },
  ],
  final_answer: 'x = 5',
  your_turn: 'Now subtract 7 from both sides of yours, then divide by 3.',
};

describe('WorkedExample', () => {
  it('shows their problem beside the practice version, and labels which is unsolved', () => {
    // Showing both is what lets a student see for themselves that the example is
    // genuinely a different problem.
    render(<WorkedExample content={content} />);
    expect(screen.getByText(/your problem — not solved/i)).toBeInTheDocument();
    expect(screen.getByText(/practice version — same method/i)).toBeInTheDocument();
    expect(screen.getByText(/coefficient 3 became 5/)).toBeInTheDocument();
  });

  it('reveals one step at a time rather than dumping the solution', () => {
    render(<WorkedExample content={content} />);
    expect(screen.getByText('Subtract 4 from both sides.')).toBeInTheDocument();
    expect(screen.queryByText('Divide both sides by 5.')).not.toBeInTheDocument();

    // The answer must stay hidden until the working has been walked through.
    expect(screen.queryByText(/answer to the practice version/i)).not.toBeInTheDocument();
  });

  it('advances through the steps and then shows the answer and the hand-back', () => {
    render(<WorkedExample content={content} />);
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));

    expect(screen.getByText('Divide both sides by 5.')).toBeInTheDocument();
    expect(screen.getByText(/answer to the practice version/i)).toBeInTheDocument();
    expect(screen.getByText(/your turn/i)).toBeInTheDocument();
    expect(screen.getByText(/subtract 7 from both sides of yours/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next step/i })).not.toBeInTheDocument();
  });

  it('can skip straight to the end for someone who just wants the method', () => {
    render(<WorkedExample content={content} />);
    fireEvent.click(screen.getByRole('button', { name: /show all/i }));

    expect(screen.getByText('Divide both sides by 5.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument();
  });

  it('typesets the maths in the problems and steps', () => {
    const { container } = render(<WorkedExample content={content} />);
    expect(container.querySelectorAll('.katex').length).toBeGreaterThan(1);
  });

  it('renders steps that carry no latex', () => {
    render(
      <WorkedExample
        content={{ ...content, steps: [{ explanation: 'Read the question carefully first.' }] }}
      />
    );
    expect(screen.getByText('Read the question carefully first.')).toBeInTheDocument();
  });

  it('degrades gracefully when the model returns no steps at all', () => {
    render(<WorkedExample content={{ ...content, steps: [] }} />);
    expect(screen.getByText(/practice version — same method/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next step/i })).not.toBeInTheDocument();
    // With nothing to reveal, the answer and hand-back are immediately available.
    expect(screen.getByText(/your turn/i)).toBeInTheDocument();
  });
});
