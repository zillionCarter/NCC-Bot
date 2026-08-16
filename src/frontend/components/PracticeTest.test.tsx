import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PracticeTest } from './PracticeTest';
import * as api from '../api/client';

afterEach(() => vi.restoreAllMocks());

const questions = [{ prompt: 'What is 2 + 2?', choices: ['3', '4', '5'], correct_answer: '', explanation: '' }];

describe('PracticeTest', () => {
  it('disables Submit until every question is answered', () => {
    render(<PracticeTest conversationId="c1" messageId="m1" questions={questions} />);
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('4'));
    expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled();
  });

  it('does not show correctness or explanation before submitting', () => {
    render(<PracticeTest conversationId="c1" messageId="m1" questions={questions} />);
    fireEvent.click(screen.getByLabelText('4'));
    expect(screen.queryByText(/because 2 \+ 2/i)).not.toBeInTheDocument();
  });

  it('reveals correctness and explanation only after the grade response returns', async () => {
    vi.spyOn(api, 'gradePracticeTest').mockResolvedValue({
      results: [{ correct: true, correct_answer: '4', explanation: 'Because 2 + 2 = 4.' }],
    });
    render(<PracticeTest conversationId="c1" messageId="m1" questions={questions} />);

    fireEvent.click(screen.getByLabelText('4'));
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(screen.queryByText(/because 2 \+ 2/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/because 2 \+ 2/i)).toBeInTheDocument());
    expect(api.gradePracticeTest).toHaveBeenCalledWith('c1', 'm1', ['4']);
  });

  it('locks the answer inputs after grading', async () => {
    vi.spyOn(api, 'gradePracticeTest').mockResolvedValue({
      results: [{ correct: false, correct_answer: '4', explanation: 'Because 2 + 2 = 4.' }],
    });
    render(<PracticeTest conversationId="c1" messageId="m1" questions={questions} />);

    fireEvent.click(screen.getByLabelText('3'));
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(screen.getByLabelText('3')).toBeDisabled());
  });
});
