import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Flashcards } from './Flashcards';

const cards = [
  { front: 'What is H2O?', back: 'Water' },
  { front: 'What is NaCl?', back: 'Salt' },
];

describe('Flashcards', () => {
  it('shows the front by default and flips to the back on click', () => {
    render(<Flashcards cards={cards} />);
    expect(screen.getByText('What is H2O?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('What is H2O?'));
    expect(screen.getByText('Water')).toBeInTheDocument();
  });

  it('advances to the next card and resets the flip state', () => {
    render(<Flashcards cards={cards} />);
    fireEvent.click(screen.getByText('What is H2O?'));
    fireEvent.click(screen.getByText('Next →'));
    expect(screen.getByText('What is NaCl?')).toBeInTheDocument();
  });
});
