import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable } from './DataTable';

function rowOrder(): string[] {
  return Array.from(document.querySelectorAll('tbody tr')).map((row) => row.querySelector('td')!.textContent!.trim());
}

describe('DataTable', () => {
  const content = {
    type: 'table' as const,
    title: 'Planet data',
    columns: ['Planet', 'Moons'],
    rows: [
      ['Earth', '1'],
      ['Mars', '2'],
      ['Jupiter', '95'],
    ],
  };

  it('renders the headers and rows', () => {
    render(<DataTable content={content} />);
    expect(screen.getByText('Planet data')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('sorts ascending, then descending, then back to the original order', () => {
    render(<DataTable content={content} />);
    const header = screen.getByRole('button', { name: /planet/i });

    fireEvent.click(header);
    expect(rowOrder()).toEqual(['Earth', 'Jupiter', 'Mars']);

    fireEvent.click(header);
    expect(rowOrder()).toEqual(['Mars', 'Jupiter', 'Earth']);

    // The model's own ordering can be meaningful (chronology, rank), so a third
    // click restores it rather than cycling back to ascending.
    fireEvent.click(header);
    expect(rowOrder()).toEqual(['Earth', 'Mars', 'Jupiter']);
  });

  it('sorts numeric columns by value, not as strings', () => {
    render(<DataTable content={content} />);
    fireEvent.click(screen.getByRole('button', { name: /moons/i }));
    // Sorted as text this would put 95 before 1 and 2.
    expect(rowOrder()).toEqual(['Earth', 'Mars', 'Jupiter']);
  });

  it('exposes the sort state to assistive technology', () => {
    render(<DataTable content={content} />);
    fireEvent.click(screen.getByRole('button', { name: /planet/i }));
    expect(screen.getAllByRole('columnheader')[0].querySelector('button')).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
  });

  it('renders inline maths inside cells', () => {
    const { container } = render(
      <DataTable content={{ type: 'table', columns: ['Formula'], rows: [['$x^2$']] }} />
    );
    expect(container.querySelector('.katex')).toBeTruthy();
  });

  it('pads a short row rather than dropping the cell', () => {
    render(<DataTable content={{ type: 'table', columns: ['A', 'B'], rows: [['only']] }} />);
    expect(document.querySelectorAll('tbody td')).toHaveLength(2);
  });

  it('says so when the table has no columns', () => {
    render(<DataTable content={{ type: 'table', columns: [], rows: [] }} />);
    expect(screen.getByText(/without any columns/i)).toBeInTheDocument();
  });
});
