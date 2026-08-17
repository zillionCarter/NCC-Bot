import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StudyPlan } from './StudyPlan';
import type { ModelContent } from '../../types';

const content: Extract<ModelContent, { type: 'study_plan' }> = {
  type: 'study_plan',
  title: 'Two-week maths revision',
  sessions: [
    { label: 'Monday', date: '2026-09-07', focus: 'Linear equations', minutes: 45, tasks: ['Ex 4A', 'Ex 4B'] },
    { label: 'Tuesday', focus: 'Quadratics', minutes: 30, tasks: ['Ex 5A'] },
  ],
};

beforeEach(() => {
  localStorage.clear();
});

describe('StudyPlan', () => {
  it('lists the sessions with their focus and time', () => {
    render(<StudyPlan content={content} messageId="m1" />);
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('Linear equations')).toBeInTheDocument();
    expect(screen.getByText('45 min')).toBeInTheDocument();
    expect(screen.getByText('75 min total')).toBeInTheDocument();
  });

  it('tracks progress across all tasks', () => {
    render(<StudyPlan content={content} messageId="m1" />);
    expect(screen.getByText('0 of 3 done')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByText('1 of 3 done')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('remembers ticks across a remount', () => {
    render(<StudyPlan content={content} messageId="m1" />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    cleanup();

    render(<StudyPlan content={content} messageId="m1" />);
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('1 of 3 done')).toBeInTheDocument();
  });

  it('keeps the progress of separate plans separate', () => {
    render(<StudyPlan content={content} messageId="m1" />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    cleanup();

    render(<StudyPlan content={content} messageId="m2" />);
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(false);
  });

  it('clears all ticks on request', () => {
    render(<StudyPlan content={content} messageId="m1" />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: /clear ticks/i }));

    expect(screen.getByText('0 of 3 done')).toBeInTheDocument();
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(false);
  });

  it('renders a session with no date or duration', () => {
    render(
      <StudyPlan
        content={{ type: 'study_plan', sessions: [{ label: 'Session 1', focus: 'Anything', tasks: ['Read'] }] }}
        messageId="m3"
      />
    );
    expect(screen.getByText('Session 1')).toBeInTheDocument();
    expect(screen.queryByText(/min total/)).not.toBeInTheDocument();
  });

  it('ignores an unparseable date rather than printing Invalid Date', () => {
    render(
      <StudyPlan
        content={{
          type: 'study_plan',
          sessions: [{ label: 'Someday', date: 'not-a-date', focus: 'x', tasks: ['y'] }],
        }}
        messageId="m4"
      />
    );
    expect(screen.queryByText(/invalid date/i)).not.toBeInTheDocument();
  });
});
