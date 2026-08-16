import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Graph } from './Graph';

describe('Graph', () => {
  it('renders a title for a bar chart without crashing', () => {
    render(
      <Graph
        content={{ type: 'graph', chartType: 'bar', data: [1, 2, 3], labels: ['a', 'b', 'c'], title: 'Test Graph' }}
      />
    );
    expect(screen.getByText('Test Graph')).toBeInTheDocument();
  });

  it('renders without a title when none is provided', () => {
    render(<Graph content={{ type: 'graph', chartType: 'line', data: [1, 2, 3] }} />);
    expect(screen.queryByText('Test Graph')).not.toBeInTheDocument();
  });
});
